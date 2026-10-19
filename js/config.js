/* js/config.js
   Enkel instellingen en korte uitleg per instelling.
   Vervang APPS_SCRIPT_URL door de web-app URL die je van Apps Script krijgt.
*/

const APPS_SCRIPT_URL = ""; 
// Bijvoorbeeld: "https://script.google.com/macros/s/AKfycbx.../exec"
// Vul hier de web-app URL nadat je het Apps Script hebt gedeployed.

const GITHUB_PAGES_ORIGIN = "https://kefke1993.github.io";
// Deze origin is ingesteld op jouw GitHub Pages-host; pas aan indien nodig.

const CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB per chunk (meerder van 256 KB)
const MAX_RETRIES_PER_CHUNK = 5; // aantal herpogingen per chunk bij fout
const CONCURRENT_UPLOADS = 2; // 1 of 2 uploads tegelijk op mobiele netwerken
const RETRY_BASE_DELAY_MS = 800; // basis voor exponential backoff (vermenigvuldigd per poging)
