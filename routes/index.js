var express = require('express');
var router = express.Router();
var http = require('http');
var azure = require('azure-storage');
var solrService = require('utility/solrServices');
var coreMapping = require('core-mapping');
var dataUtils = require('utility/dataUtils');
var traslator = require('utility/entityTraslatorUtils');
var jsStringEscape = require('js-string-escape');
var async = require('async');
var apiKeyValidator = require('utility/apiKeyGuaranteed');
var constants = require('utility/constants');

var tableService = azure.createTableService(constants.getConstant('connectionString'));

// GET home page. 
router.get('/', function(req, res, next) {
    //res.render('index', { title: 'Express' });
    res.json({ message: 'yes ok, but this is just the index hello' });
});


/*** ---------------------------------------------------------------------------------------------------- ***/
/**                             SEZIONE API PER EFFETTUARE LE CHIAMATE SU SOLR                            
 * 
 *                                   AGGIUNGERE LA GESTIONE DELLE API-KEY
 * 
/*** ---------------------------------------------------------------------------------------------------- ***/

/* Esposizione servizio POST per recuperare i correlati */
//l'istruzione .route associata ad un router ci permette di definire a quale path risponderà la chiamata.
router.route(constants.getConstant('getRecommendationPath'))
    // .post indica il tipo di chiamata http accettata per il mapping definito; in req e res, sono presenti i
    // dati di request e response per della chiamata
    .post(function(req, res) {

         var reqHeaders = req.get('Content-Type');

        //genero un transaction-id per tracciare il processo sui log
        if (apiKeyValidator.isKeyEnabled(req.params.apikey)) {

            if (reqHeaders === 'application/json') {
                console.log(reqHeaders);


                //nella variabile term inserisco il valore passato in che viene letto dal JSON in ingresso.
                //per recuperare il parametro faccio: [request].[posizione_parametro].[parametro_da_leggere]
                //nel caso di POST i valori da leggere sono nel body, in nodeJs vengono inseriti nell'omonima sezione body
                var interestingTermsToSearch = "";
                var runaid;
                var article_uuid;
                var categoriesString = '';
                var city;
                var gps_position;
                var local_from_request;
                var retValue = "";
                var nationalResponse = "";
                var localResponse = "";
                var relatedArticles = "";
                var termsToSearch = '';
                async.series([
                    //funzione che legge i dati dalla request
                    function(callback) {
                        console.log("- INIZIO PRIMO METEODO DELL'ASYNC SERIES ");
                        runaid = encodeURIComponent(req.body.runaid);
                        article_uuid = encodeURIComponent(req.body.article_uuid);
                        var categories = encodeURIComponent(req.body.preferences);
                        city = encodeURIComponent(req.body.city);
                        gps_position = encodeURIComponent(req.body.gps_position);
                        local_from_request = encodeURIComponent(req.body.article_core);

                        var categoriesTemp = categories.split("\%2C");

                        categoriesTemp.forEach(function(item, index) {
                            if (index == 0) {
                                categoriesString += categoriesTemp[index];
                            } else {
                                categoriesString += '+OR+' + categoriesTemp[index];
                            }
                        });
                        console.log("FINE METEODO 2.1.1 DELL'ASYNC SERIES ");
                        callback();
                    },
                    //funzione che controlla i dati ricevuti e ritorna gli interestingTerms
                    function(callback) {
                        console.log("INIZIO SECONDO METEODO DELL'ASYNC SERIES ");
                        if (local_from_request != null && local_from_request != "") {

                            var str = '';
                            console.log("INIZIO METEODO 2.1.1 DELL'ASYNC SERIES ");
                            console.log("sono nell'IF");
                            /** IL LOCAL MI VIENE PASSATO */
                            //definisco i dati da inviare nella chiamata a SOLR
                            var opsInterestingTermsWithLocal = {
                                method: "GET",
                                host: slrHost,
                                path: "/publicsearch/" + local_from_request + "/mlt/select/?q=uuid:" + article_uuid + "&mlt.fl=titolo,sottotitolo,testo,keywords&mlt.mindf=0&mlt.mintf=3&mlt.interestingTerms=list&mlt.minwl=6&version=2.2&start=0&rows=1&indent=on&wt=json"
                            };
                            doSolrQueryForGettingInterestingTerm(opsInterestingTermsWithLocal, function(result) {
                                var interestingTermsStirng = JSON.parse(result);
                                interestingTermsStirng.interestingTerms.forEach(function(item, index) {
                                    if (index == 0) {
                                        termsToSearch += interestingTermsStirng.interestingTerms[index];
                                    } else {
                                        termsToSearch += '+OR+' + interestingTermsStirng.interestingTerms[index];
                                    }
                                });
                                //faccio l'escape dei valori
                                termsToSearch = jsStringEscape(termsToSearch);
                                callback();
                            });
                            console.log("FINE METEODO 2.1.1 DELL'ASYNC SERIES ");
                        } else {
                            var str = "";
                            var localcore = "";

                            //chiamo SOLR per recuperare i dettagli dell'articolo passato

                            console.log("INIZIO METEODO 2.2.1 DELL'ASYNC SERIES ");
                            var opsForSearchThelocal = {
                                //definisco i dati da inviare nella chiamata a SOLR
                                method: "GET",
                                //uri: protocol + slrHost + "/primopiano/select/?q=uuid:"+article_uuid+"&shards="+slrHost+"/localroma,"+slrHost+"/localmilano,"+slrHost+"/corfiorentino,"+slrHost+"/localcormez,"+slrHost+"/localveneto,"+slrHost+"/localbergamo,"+slrHost+"/localbrescia,"+slrHost+"/localbologna&version=2.2&start=0&rows=1&indent=on&wt=json",
                                host: slrHost,
                                path: "/publicsearch/primopiano/select/?q=uuid:" + article_uuid + "&shards=" + slrHost + "/publicsearch/localroma," + slrHost + "/publicsearch/localmilano," + slrHost + "/publicsearch/corfiorentino," + slrHost + "/publicsearch/localcormez," + slrHost + "/publicsearch/localveneto," + slrHost + "/publicsearch/localbergamo," + slrHost + "/publicsearch/localbrescia," + slrHost + "/publicsearch/localbologna&version=2.2&start=0&rows=1&indent=on&wt=json"
                            };


                            doSolrQueryForGettingInterestingTerm(opsForSearchThelocal, function(result) {
                                localcore = JSON.parse(result);
                                //localcore = JSON.parse(str);
                                localcore.response.docs.forEach(function(item, index) {
                                    localcore = localcore.response.docs[index].testata;
                                });
                                localcore = coreMapping.getCore(localcore.toLowerCase());

                                var opsInterestingTermsWithNoLocal = {
                                    //definisco i dati da inviare nella chiamata a SOLR
                                    method: 'GET',
                                    host: slrHost,
                                    path: "/publicsearch/" + localcore + "/mlt/select/?q=uuid:" + article_uuid + "&mlt.fl=titolo,sottotitolo,testo,keywords&mlt.mindf=0&mlt.mintf=3&mlt.interestingTerms=list&mlt.minwl=6&wt=json"
                                };
                                doSolrQueryForGettingInterestingTerm(opsInterestingTermsWithNoLocal, function(result) {
                                    //console.log("doSolrQueryForGettingInterestingTerm result: " + result);                            c
                                    var interestingTermsStirng = JSON.parse(result);
                                    interestingTermsStirng.interestingTerms.forEach(function(item, index) {
                                        if (index == 0) {
                                            termsToSearch += interestingTermsStirng.interestingTerms[index];
                                        } else {
                                            termsToSearch += '+OR+' + interestingTermsStirng.interestingTerms[index];
                                        }
                                    });
                                    //faccio l'escape dei valori
                                    termsToSearch = jsStringEscape(termsToSearch);
                                    console.log("FINE METEODO 2.2.1 DELL'ASYNC SERIES ");
                                    callback();
                                });



                                doSolrQueryForGettingInterestingTerm(opsForSearchThelocal, function(result) {
                                    localcore = JSON.parse(result);
                                    //localcore = JSON.parse(str);
                                    localcore.response.docs.forEach(function(item, index) {
                                        localcore = localcore.response.docs[index].testata;
                                    });
                                    localcore = coreMapping.getCore(localcore.toLowerCase());

                                    var opsInterestingTermsWithNoLocal = {
                                        //definisco i dati da inviare nella chiamata a SOLR
                                        method: 'GET',
                                        host: slrHost,
                                        path: "/publicsearch/" + localcore + "/mlt/select/?q=uuid:" + article_uuid + "&mlt.fl=titolo,sottotitolo,testo,keywords&mlt.mindf=0&mlt.mintf=3&mlt.interestingTerms=list&mlt.minwl=6&wt=json"
                                    };
                                    doSolrQueryForGettingInterestingTerm(opsInterestingTermsWithNoLocal, function(result) {
                                        //console.log("doSolrQueryForGettingInterestingTerm result: " + result);                            c
                                        var interestingTermsStirng = JSON.parse(result);
                                        interestingTermsStirng.interestingTerms.forEach(function(item, index) {
                                            if (index == 0) {
                                                termsToSearch += interestingTermsStirng.interestingTerms[index];
                                            } else {
                                                termsToSearch += '+OR+' + interestingTermsStirng.interestingTerms[index];
                                            }
                                        });
                                        //faccio l'escape dei valori
                                        termsToSearch = jsStringEscape(termsToSearch);
                                        console.log("FINE METEODO 2.2.1 DELL'ASYNC SERIES ");
                                        callback();
                                    });
                                });
                            });
                        }
                    },
                    //funzione per le chiamate parallele per la lettura dei correlati
                    function(callback) {
                        console.log("INIZIO TERZO METEODO DELL'ASYNC SERIES ");
                        var core = coreMapping.getCore(city.toLowerCase());
                        //chiamo un metodo che mi gestisce il parallelismo 

                        var categoriesStringWeighted = "(" + categoriesString + ")^100";
                        //dataInterval = '';
                        dataInterval = encodeURIComponent(constants.getConstant('dataInterval'));

                        interestingTermsToSearch = termsToSearch;
                        async.parallel([
                            //funzione che chiama SOLR per i correlati nazionali leggo 3 correlati
                            function(callback2) {
                                var reqPromOptionsNationalRelated = {
                                    //definisco i dati da inviare nella chiamata a SOLR
                                    method: "GET",
                                    //uri: "http://smart.corriere.it/publicsearch/primopiano/select/?q=titolo:(" + interestingTermsToSearch + ")+OR+sottotitolo:(" + interestingTermsToSearch + ")+OR+testo:(" + interestingTermsToSearch + ")+OR+keywords:(" + interestingTermsToSearch + ")&version=2.2&start=0&rows=10&wt=json"

                                    host: constants.getConstant('slrHost'),
                                    path: jsStringEscape("/publicsearch/primopiano/select/?q=titolo:(" + termsToSearch + ")+OR+sottotitolo:(" + termsToSearch + ")+OR+testo:(" + termsToSearch + ")+OR+keywords:(" + termsToSearch + ")+OR+NOT+uuid:" + article_uuid + "&fl=idapplication,titolo,sottotitolo,photo_name,price_type,product_type,sezione,url_appmobile&version=2.2&start=0&rows=3&&indent=on&wt=json")
                                    //path: jsStringEscape("/publicsearch/primopiano/select/?q=titolo:(" + termsToSearch + ")+OR+sottotitolo:(" + termsToSearch + ")+OR+testo:(" + termsToSearch + ")+OR+keywords:(" + termsToSearch + ")+OR+sezione:(" + categoriesString + ")+OR+NOT+uuid:"+article_uuid+"&bq=sezione:"+categoriesStringWeighted+"&bq=datamod:"+dataInterval+"&fl=idapplication,titolo,sottotitolo,photo_name&version=2.2&start=0&rows=3&&indent=on&wt=json")

                                };
                                doSolrQueryForGettingInterestingTerm(reqPromOptionsNationalRelated, function(result) {
                                    nationalResponse = JSON.parse(result);
                                    callback2();
                                });
                            },
                            //funzione che chiama SOLR per i correlati geolocalizzati leggo 1 correlato
                            function(callback2) {

                                if (core != constants.getConstant('coreNotFound')) {
                                    var reqPromOptionsLocalRelated = {
                                        //definisco i dati da inviare nella chiamata a SOLR
                                        method: "GET",
                                        host: constants.getConstant('slrHost'),
                                        path: jsStringEscape("/publicsearch/" + core + "/select/?q=titolo:(" + termsToSearch + ")+OR+sottotitolo:(" + termsToSearch + ")+OR+testo:(" + termsToSearch + ")+OR+keywords:(" + termsToSearch + ")+OR+NOT+uuid:" + article_uuid + "&fl=idapplication,titolo,sottotitolo,photo_name,price_type,product_type,sezione,url_appmobile&version=2.2&start=0&rows=1&indent=on&wt=json")
                                        //path: jsStringEscape("/publicsearch/" + core + "/select/?q=titolo:(" + termsToSearch + ")+OR+sottotitolo:(" + termsToSearch + ")+OR+testo:(" + termsToSearch + ")+OR+keywords:(" + termsToSearch + ")+OR+sezione:(" + categoriesString + ")+OR+NOT+uuid:"+article_uuid+"&bq=sezione:"+categoriesStringWeighted+"&bq=datamod:"+dataInterval+"&fl=idapplication,titolo,sottotitolo,photo_name&version=2.2&start=0&rows=1&indent=on&wt=json")

                                        //uri: "http://smart.corriere.it/publicsearch/" + core + "/select/?q=titolo:(" + interestingTermsToSearch + ")+OR+sottotitolo:(" + interestingTermsToSearch + ")+OR+testo:(" + interestingTermsToSearch + ")+OR+keywords:(" + interestingTermsToSearch + ")&version=2.2&start=0&rows=10&wt=json"
                                    };
                                    doSolrQueryForGettingInterestingTerm(reqPromOptionsLocalRelated, function(result) {
                                        localResponse = JSON.parse(result);
                                        callback2();
                                    });
                                } else {
                                    callback2();
                                }

                            }

                        ], function(error) {
                            if (!error) {
                                console.log("All functions Finished");
                            } else {
                                console.log("Error on parallel call: " + error)
                                res.writeHead(500, { "Content-Type": "application/json" });
                                res.end(JSON.stringify({ message: constants.getConstant('serviceNotAvailable'), value: error }));
                            }
                            callback();
                        });
                        console.log("FINE TERZO METEODO DELL'ASYNC SERIES ");

                    },
                    //funzione che costruisce i risultati da tornare all'utente
                    function(callback) {
                        //faccio il merge dei dati e popolo la resposne
                        var nationalRetValue = dataUtils.formatSorlResponse(nationalResponse);
                        nationalResponse = JSON.stringify(nationalRetValue);
                        if (localResponse != '') {
                            var localRetValue = dataUtils.formatSorlResponse(localResponse);
                            localResponse = JSON.stringify(localRetValue);

                            relatedArticles = mergeResponse(localResponse, nationalResponse);
                        } else {
                            relatedArticles = nationalResponse;
                        }

                        callback();
                    }
                ],
                    function(error) {
                        if (!error) {
                            console.log("All functions Finished");
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(relatedArticles);
                        } else {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ message: constants.getConstant('serviceNotAvailable'), value: error }));
                        }
                    });
            } else {
                res.writeHead(415, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: 415, message: constants.getConstant('unsupportedMediaType') }));
            }
        } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: constants.getConstant('methodNotAllowed') }));
        }

    });

/*** ---------------------------------------------------------------------------------------------------- ***/
/**                          FINE SEZIONE API PER EFFETTUARE LE CHIAMATE SU SOLR                           **/
/*** ---------------------------------------------------------------------------------------------------- ***/

function doSolrQueryForGettingInterestingTerm(options, callback) {
    var str2 = '';
    http.get(options, function(response) {

        response.on('data', function(chunk) {
            str2 += chunk;
        });
        response.on('end', function() {
            callback(str2);
        })
        response.on('error', function(chunk) {
            callback(constants.getConstant('erroreInDoSolrQuery'));
        });
    });
}


function mergeResponse(geoLocResponse, genericResponse) {
    if (geoLocResponse != null && genericResponse != "") {
        // console.log("geoLocResponse: " + geoLocResponse);
        //  console.log("genericResponse: " + genericResponse);
        var retArticles = [];
        var retStringArticles = '';
        genericResponse = JSON.parse(genericResponse);
        geoLocResponse = JSON.parse(geoLocResponse);
        var genericResponseLenght = 0;
        var genericIndex = 0
        genericResponse.forEach(function(item, index) {
            if (index < 2) {
                retArticles.push(genericResponse[index]);
            }
        });

        geoLocResponse.forEach(function(item, index) {
            retArticles.push(geoLocResponse[index]);
        });

        //console.log("retArticles" + JSON.stringify(retArticles));
        return JSON.stringify(retArticles);
    }
}


/*** ---------------------------------------------------------------------------------------------------- ***/
/**                     SEZIONE API PER EFFETTUARE LE CHIAMATE AL MACHINE LEARNING
 * 
 *                                AGGIUNGERE LA GESTIONE DELLE API-KEY 
 * 
/*** ---------------------------------------------------------------------------------------------------- ***/

router.route(constants.getConstant('userNavigationPath'))
    // .put indica il tipo di chiamata http accettata per il mapping definito; in req e res, sono presenti i
    // dati di request e response per della chiamata
    .put(function(req, res) {

        var reqHeaders = req.get('Content-Type');
        console.log(reqHeaders);

        if (apiKeyValidator.isKeyEnabled(req.params.apikey)) {

            if (reqHeaders === 'application/json') {
                console.log(reqHeaders);


                //nella variabile term inserisco il valore passato in che viene letto dal JSON in ingresso.
                //per recuperare il parametro faccio: [request].[posizione_parametro].[parametro_da_leggere]
                //nel caso di POST i valori da leggere sono nel body, in nodeJs vengono inseriti nell'omonima sezione body
                tableName = constants.getConstant('tableNameUserNavigation');

                var errorBool = false;
                var errArray = [];
                var entityToSave = [];
                var indexPrimario = 0;
                req.body.forEach(function(item, index) {
                    indexPrimario++;
                });
                async.series([
                    function(callback) {
                        var indexForReturn = 0;
                        console.log("PRIMO ASYNC DEL METEODO usernavigation")
                        req.body.forEach(function(item, index) {
                            var entGen = azure.TableUtilities.entityGenerator;
                            //richiamo il traslator per convertire il body ricevuto in entity e scriverlo poi sulle tabelle
                            var entity = traslator.setUserNavigationEntity(req.body[index], entGen);
                            //in questo modo vado a ciclare su tutti gli oggetto presenti nel body
                            //devo formattare in dati del body nel fomrato che mi serve.
                            entityToSave.push(entity);
                            indexForReturn++;
                            if (req.body.length == indexForReturn && entityToSave.length == req.body.length) {
                                console.log("FINE PRIMO ASYNC DEL METEODO usernavigation")
                                callback();
                            }
                        });
                    },
                    function(callback) {
                        var indexForCallback = 0;
                        console.log("SECONDO ASYNC DEL METEODO usernavigation")
                        entityToSave.forEach(function(item, index) {
                            tableService.insertEntity(tableName, entityToSave[index], function(error, result, response) {
                                indexForCallback++;
                                if (!error) {
                                    // result contains the ETag for the new entity
                                    console.log("result: " + result)
                                    console.log("response: " + response)
                                }
                                else {
                                    console.log("ERROR on ENTITY Creation: " + error)
                                    errArray.push(error);
                                    errorBool = true

                                }
                                if (req.body.length == indexForCallback) {
                                    console.log("req.body.length: " + req.body.length + "-" + "indexForCallback: " + indexForCallback)
                                    console.log("FINE SECONDO ASYNC DEL METEODO usernavigation")
                                    callback();
                                }
                            });
                        });
                    }
                ],
                    function(error) {
                        if (!error) {
                            if (errorBool) {
                                res.writeHead(500, { "Content-Type": "application/json" });
                                res.end(JSON.stringify({ message: constants.getConstant('errorOnEntityCreation'), value: errArray }));
                            } else {
                                res.writeHead(200, { "Content-Type": "application/json" });
                                res.end(JSON.stringify({ message: constants.getConstant('allEntityCreated') }));

                            }
                        } else {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ message: constants.getConstant('serviceNotAvailable'), value: error }));
                        }
                    });

            } else {
                res.writeHead(415, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: 415, message: constants.getConstant('unsupportedMediaType') }));
            }
        } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: constants.getConstant('methodNotAllowed') }));
        }
    });

router.route(constants.getConstant('userProfilePath'))
    // .put indica il tipo di chiamata http accettata per il mapping definito; in req e res, sono presenti i
    // dati di request e response per della chiamata
    .put(function(req, res) {
        
         var reqHeaders = req.get('Content-Type');
        
        if (apiKeyValidator.isKeyEnabled(req.params.apikey)) {

            if (reqHeaders === 'application/json') {
                console.log(reqHeaders);

                //nella variabile term inserisco il valore passato in che viene letto dal JSON in ingresso.
                //per recuperare il parametro faccio: [request].[posizione_parametro].[parametro_da_leggere]
                //nel caso di POST i valori da leggere sono nel body, in nodeJs vengono inseriti nell'omonima sezione body
                var tableName = constants.getConstant('tableNameUserProfiles');

                var entGen = azure.TableUtilities.entityGenerator;

                //richiamo il traslator per convertire il body ricevuto in entity e scriverlo poi sulle tabelle
                var entity = traslator.setUserDetailEntity(req.body, entGen);
                //in questo modo vado a ciclare su tutti gli oggetto presenti nel body
                //devo formattare in dati del body nel fomrato che mi serve.

                tableService.insertEntity(tableName, entity, function(error, result, response) {
                    if (!error) {
                        // result contains the ETag for the new entity
                        console.log("result: " + result)
                        console.log("response: " + response)
                        res.end(JSON.stringify({ message: constants.getConstant('entityCreated') }));
                    }
                    else {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ message: constants.getConstant('entityNotCreated'), value: error }));
                    }
                });
            } else {
                res.writeHead(415, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: 415, message: constants.getConstant('unsupportedMediaType') }));
            }
        } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: constants.getConstant('methodNotAllowed') }));
        }

    });

router.route(constants.getConstant('setCatalogPath'))
    // .put indica il tipo di chiamata http accettata per il mapping definito; in req e res, sono presenti i
    // dati di request e response per della chiamata
    .post(function(req, res) {

         var reqHeaders = req.get('Content-Type');

        if (apiKeyValidator.isKeyEnabled(req.params.apikey)) {

            if (reqHeaders === 'application/json') {
                console.log(reqHeaders);

                //nella variabile term inserisco il valore passato in che viene letto dal JSON in ingresso.
                //per recuperare il parametro faccio: [request].[posizione_parametro].[parametro_da_leggere]
                //nel caso di POST i valori da leggere sono nel body, in nodeJs vengono inseriti nell'omonima sezione body
                var tableName = constants.getConstant('tableNameCatalog');

                var entGen = azure.TableUtilities.entityGenerator;

                //richiamo il traslator per convertire il body ricevuto in entity e scriverlo poi sulle tabelle
                var entity = traslator.setSolrArticleEntity(req.body, entGen);
                //in questo modo vado a ciclare su tutti gli oggetto presenti nel body
                //devo formattare in dati del body nel fomrato che mi serve.

                tableService.insertEntity(tableName, entity, function(error, result, response) {
                    if (!error) {
                        // result contains the ETag for the new entity
                        console.log("result: " + result)
                        console.log("response: " + response)
                        res.end(JSON.stringify({ message: constants.getConstant('entityCreated') }));
                    }
                    else {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ message: constants.getConstant('entityNotCreated'), value: error }));
                    }
                });
            } else {
                res.writeHead(415, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: 415, message: constants.getConstant('unsupportedMediaType') }));
            }
        } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: constants.getConstant('methodNotAllowed') }));
        }

    });



/* SEZIONE API MACHINE LEARNING DI GESTIONE DEI DATI */
//CREATE TABLE
router.route(constants.getConstant('createTablePath'))

    .post(function(req, res) {
        
         var reqHeaders = req.get('Content-Type');
        
        if (apiKeyValidator.isAdminKeyEnabled(req.params.apikey)) {

            if (reqHeaders === 'application/json') {
                console.log(reqHeaders);


                // if(apiKeyValidator.isKeyEnabled(req.params.apikey))

                var tableName = req.body.tablename;
                tableService.createTableIfNotExists(tableName, function(error, result, response) {
                    if (!error) {
                        // result contains true if created; false if already exists
                        if (result)
                            res.end(JSON.stringify({ message: constants.getConstant('createdNewTable') + tableName }));
                        else
                            res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ message: constants.getConstant('tableAlreadyExists') + tableName }));
                    } else {
                        console.log(error);
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ message: constants.getConstant('errorCreating') + tableName }));
                    }
                });
            } else {
                res.writeHead(415, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: 415, message: constants.getConstant('unsupportedMediaType') }));
            }
        } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: constants.getConstant('methodNotAllowed') }));
        }

    });


//RETRIEVE ENTITY
router.route(constants.getConstant('retrieveByUuidPath'))

    .post(function(req, res) {

         var reqHeaders = req.get('Content-Type');

        console.log("req.params.apikey: " + req.params.apikey);
        if (apiKeyValidator.isAdminKeyEnabled(req.params.apikey)) {

            if (reqHeaders === 'application/json') {
                console.log(reqHeaders);

                var tableName = req.body.tablename;
                var entity_key = req.body.entity_key;

                var query = new azure.TableQuery()
                    .where('ArticleUUID eq ?', entity_key);



                tableService.queryEntities(tableName, query, null, function(error, result, response) {
                    if (!error) {
                        //console.log(result);
                        res.json(result);
                    }
                });

            } else {
                res.writeHead(415, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: 415, message: constants.getConstant('unsupportedMediaType') }));
            }
        } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: constants.getConstant('methodNotAllowed') }));
        }

    });
router.route(constants.getConstant('retrieveByRunaIdPath'))

    .post(function(req, res) {

         var reqHeaders = req.get('Content-Type');

        if (apiKeyValidator.isAdminKeyEnabled(req.params.apikey)) {
            console.log(reqHeaders);

            if (reqHeaders === 'application/x-www-form-urlencoded') {


                var tableName = req.body.tablename;
                //console.log("tableName: " + tableName);
                var entity_key = req.body.entity_key;
                // console.log("tableName: " + entity_key);
                var field_key = req.body.field_key;
                //console.log("filed_key: " + field_key);

                var query = new azure.TableQuery()
                    .where(field_key + ' eq ?', entity_key);



                tableService.queryEntities(tableName, query, null, function(error, result, response) {
                    if (!error) {
                        //console.log(result);
                        res.json(result);
                    }
                });
            } else {
                res.writeHead(415, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: 415, message: constants.getConstant('unsupportedMediaType') }));
            }
        } else {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: constants.getConstant('methodNotAllowed') }));
        }

    });
/* FINE SEZIONE API MACHINE LEARNING DI GESTIONE DEI DATI  6b5e0a66-7e5b-4314-962-52cc8ffa5241*/

/*** ---------------------------------------------------------------------------------------------------- ***/
/**                  FINE SEZIONE API PER EFFETTUARE LE CHIAMATE AL MACHINE LEARNING                       **/
/*** ---------------------------------------------------------------------------------------------------- ***/





module.exports = router;
