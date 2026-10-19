README.md

Deze repository bevat de statische GitHub Pages-site en het Apps Script bridge
voor het uploaden van bestanden naar een gedeelde Google Drive-map.

Snel overzicht van belangrijke bestanden:
- index.html
- css/style.css
- js/config.js    <- bevat nu je APPS_SCRIPT_URL (Apps Script web-app URL)
- js/upload.js
- js/ui.js
- apps-script/Code.gs  <- Apps Script code (TARGET_FOLDER_ID is ingevuld)
- apps-script/appsscript.json

Wat ik zojuist deed:
- APPS_SCRIPT_URL in js/config.js ingevuld met jouw web-app URL.

Volgende stappen:
1) Controleer dat in apps-script/Code.gs de constante GITHUB_PAGES_ORIGIN overeenkomt met
   de origin van je GitHub Pages-site (protocol + host, geen pad). Standaard staat die op
   https://kefke1993.github.io.
2) Activeer GitHub Pages voor deze repository (Settings → Pages → branch: main, folder: /).
3) Test de site op een mobiel toestel via de Pages-URL.

Test (optioneel, via curl):
curl -X POST 'JE_WEBAPP_URL' -H 'Content-Type: text/plain' -d '{"name":"test.jpg","mimeType":"image/jpeg","size":1234}'

