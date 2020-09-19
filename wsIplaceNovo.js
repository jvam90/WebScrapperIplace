const puppeteer = require('puppeteer');
const sql = require('mssql');
const links = require('fs').readFileSync('links.txt', 'utf-8').split('\n');
const aparelhos = require('fs').readFileSync('aparelhos.txt', 'utf-8').split('\n');
const armazenamentos = require('fs').readFileSync('armazenamentos.txt', 'utf-8').split('\n');

const prepararParaTestes = async (page) => {
	// Pass the User-Agent Test.
	const userAgent = 'Mozilla/5.0 (X11; Linux x86_64)' +
	    'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.39 Safari/537.36';
	  await page.setUserAgent(userAgent);

  // Pass the Webdriver Test.
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
  });

  // Pass the Chrome Test.
  await page.evaluateOnNewDocument(() => {
    // We can mock this in as much depth as we need for the test.
    window.navigator.chrome = {
      runtime: {},
      // etc.
    };
  });

  // Pass the Permissions Test.
  await page.evaluateOnNewDocument(() => {
    const originalQuery = window.navigator.permissions.query;
    return window.navigator.permissions.query = (parameters) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission }) :
        originalQuery(parameters)
    );
  });

  // Pass the Plugins Length Test.
  await page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'plugins', {
      // This just needs to have `length > 0` for the current test,
      // but we could mock the plugins too if necessary.
      get: () => [1, 2, 3, 4, 5],
    });
  });

  // Pass the Languages Test.
  await page.evaluateOnNewDocument(() => {
    // Overwrite the `plugins` property to use a custom getter.
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en'],
    });
  });
}

const opts = {
    headless: false,
    defaultViewport: null,
    args: [
        '--start-maximized',
	    '--no-sandbox',
    ]
};

puppeteer.launch(opts).then(async browser => {
	const page = await browser.newPage();
    //tirando o timeout
    await page.setDefaultNavigationTimeout(0);	
	
	await prepararParaTestes(page);
    for (let link of links) {
		var dadosAjustados;
        try {
            console.log('Indo para o link: ' + link);
        	//indo para o link
            await page.goto(link);
            //aguardando algum tempo
            await page.waitFor(10000);
			
			//recuperando os dados brutos
            var dadosBrutos = await page.evaluate(() => {
				let items = Array.from(document.querySelectorAll('.prod-item-container')).map(element => element.innerText);
	            return items;
			});	
			dadosAjustados = await montarDados(dadosBrutos);
			await Promise.all(dadosAjustados.map(obj => salvarBanco(obj)));
			//await 5s
			await page.waitFor(5000);
        } catch (err) {
            console.log('Erro ao navegar para a página: ' + err);
        }
    }
    //por fim, vai fechar o navegador
    await browser.close();
});

async function salvarBanco(dados){
	const pool = new sql.ConnectionPool({
	  user: 'RegionalNE',
	  password: 'RegionalNEvivo2019',
	  server: '10.238.176.136',  
	  database: 'SOL'
	});
	pool.connect().then(function(){
		const request = new sql.Request(pool);
		const insert = "insert into [SOL].[dbo].[PRECOS_CONCORRENCIA_IPLACE_AUX] ([APARELHO], [PRECO_APARELHO], [PRECO_APARELHO_PRAZO], [DATA_CARGA]) " +
				" values ('" + dados.aparelho + "', '" + dados.precoCheio + "', '" + dados.precoPrazo + "', convert(date, getdate(),101))" ;
		request.query(insert).then(function(recordset){
			console.log('Dado inserido');			
			pool.close();
		}).catch(function(err){
			console.log(err);
			pool.close();
		})
	}).catch(function(err){
		console.log(err);
	});   	   
}

function montarDados(precos) {
    let dadosAjustados = [];
	for(let preco of precos){
		let obj = {};
		let pr = preco.split('\n');
		
		obj.aparelho = recuperarAparelho(pr[0]).replace('\r', '') + ' ' + recuperarArmazenamento(pr[0]).replace('\r', '')
		obj.precoCheio = pr[1].replace(' à vista', '');
		obj.precoPrazo = pr[2].replace('ou ', '').replace('iguais ', '');
		
		console.log(obj);
		let found = false;
		for(var i = 0; i < dadosAjustados.length; i++) {
		    if (dadosAjustados[i].aparelho == obj.aparelho) {
		        found = true;
		        break;
		    }
		}
		
		if(found == false && verificarAparelho(obj.aparelho)){
			dadosAjustados.push(obj);
		}
	}
	return dadosAjustados;
}

function verificarAparelho(aparelhoObj){
	for(let aparelho of aparelhos){
		if(aparelhoObj.toLowerCase().trim().includes(aparelho.toLowerCase().replace('\r', '').trim())){
			return true;
		}
	}
	return false;
}

function recuperarArmazenamento(aparelhoCheio){
	for(let arm of armazenamentos){
		if(aparelhoCheio.toLowerCase().trim().includes(arm.toLowerCase().replace('\r', '').trim())){
			return arm;
		}
	}
	return '';
}

function recuperarAparelho(aparelhoCheio){
	for(let aparelho of aparelhos){
		if(aparelhoCheio.toLowerCase().trim().includes(aparelho.toLowerCase().replace('\r', '').trim())){
			return aparelho;
		}
	}
	return aparelhoCheio;
}