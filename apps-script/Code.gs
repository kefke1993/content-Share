/*
  apps-script/Code.gs
  Doel: Een eenvoudige web-app endpoint dat voor een gevraagd bestand een
  Resumable Upload session aanmaakt bij de Google Drive API en de session-URL terugstuurt.

  Belangrijk:
  - Vul TARGET_FOLDER_ID in met de map-ID van jouw Drive-doelmap.
  - Vul GITHUB_PAGES_ORIGIN in met jouw GitHub Pages origin, bv:
      const GITHUB_PAGES_ORIGIN = "https://kefke1993.github.io";
    Deze wordt gebruikt bij het aanmaken van de Drive upload sessie zodat de browser later CORS-toegang heeft.

  SECURITY:
  - Dit script uploadt ALLEEN naar de vaste TARGET_FOLDER_ID en geeft geen mapinhoud terug.
  - Het script accepteert een POST met Content-Type text/plain (een JSON-string in de body)
    om de browser-preflight te vermijden (zoals gevraagd).
*/

/* ===== Configuratie: vul deze waarden vóór deployment ===== */
const TARGET_FOLDER_ID = "VUL_HIER_JE_MAP_ID_IN"; // Bijvoorbeeld "0B0...abc"
const GITHUB_PAGES_ORIGIN = "https://kefke1993.github.io"; // Vervang door jouw origin

/* ===== doPost - entrypoint voor webapp ===== */
function doPost(e) {
  // Zorg dat we altijd JSON teruggeven
  try {
    // e.postData.contents is de body (we verwachtten een JSON-string)
    var bodyText = e.postData && e.postData.contents ? e.postData.contents : '{}';
    var payload = JSON.parse(bodyText);

    var filename = payload.name || ('upload-' + (new Date().toISOString()));
    var mimeType = payload.mimeType || 'application/octet-stream';
    var size = payload.size || 0;

    // Maak metadata voor Drive
    var metadata = {
      name: filename,
      mimeType: mimeType,
      parents: [TARGET_FOLDER_ID]
    };

    // OAuth token van het script (voert uit als "ik")
    var token = ScriptApp.getOAuthToken();

    // Headers: zet Origin naar jouw GitHub Pages origin zodat Drive de juiste CORS headers teruggeeft.
    var headers = {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(size),
      'Origin': GITHUB_PAGES_ORIGIN
    };

    var options = {
      method: 'post',
      contentType: 'application/json; charset=UTF-8',
      headers: headers,
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true
    };

    // Aanroepen van de Drive API om een resumable upload sessie aan te maken
    var driveUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
    var res = UrlFetchApp.fetch(driveUrl, options);

    var code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      // Fout bij aanmaken; probeer zinvolle foutmelding terug te geven
      var errText = res.getContentText ? res.getContentText() : '';
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Kon uploadsessie niet aanmaken',
        details: errText,
        status: code
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // De API retourneert de session URL in de 'Location' header
    var headersRes = res.getHeaders();
    var uploadUrl = headersRes['Location'] || headersRes['location'];
    if (!uploadUrl) {
      return ContentService.createTextOutput(JSON.stringify({
        error: 'Geen upload URL ontvangen van Drive API'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Geef de upload URL terug aan de browser als JSON
    var output = {
      uploadUrl: uploadUrl
    };

    // Belangrijk: we antwoorden als JSON. Omdat de request Content-Type text/plain is
    // (gebruikt om preflight te vermijden), zal de browser geen preflight doen.
    // De browser verwacht bovendien dat de response CORS toestaat — doordat we
    // in de request naar Drive de Origin-header hebben gezet, zal Drive de upload-url
    // ondersteunen voor cross-origin fetches vanuit die origin.
    return ContentService.createTextOutput(JSON.stringify(output))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Zorg voor een nette fout terug naar de client
    var msg = (err && err.message) ? err.message : String(err);
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Serverfout in Apps Script',
      message: msg
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/* Optioneel: sta OPTIONS toe voor preflight (als je toch preflights krijgt) */
function doGet(e) {
  // Simpele instructie pagina (niet nodig). Houd minimal.
  return ContentService.createTextOutput(JSON.stringify({ status: 'ready' }))
    .setMimeType(ContentService.MimeType.JSON);
}
