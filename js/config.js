/* js/config.js
   Enkel instellingen en korte uitleg per instelling.
   APPS_SCRIPT_URL is ingevuld met jouw web-app URL.
   Pas GITHUB_PAGES_ORIGIN aan als je Pages-origin anders is.
*/

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzahMsU_uN0aCicQaqqhbq6bluVpDhRplSh_Nuiko-c7nhslJvz28TtA-jajzI-0ldO/exec"; 
// De web-app URL die je zojuist gedeployed hebt.

const GITHUB_PAGES_ORIGIN = "https://kefke1993.github.io";
// Deze origin gebruiken we in het Apps Script voor de Origin header.
// Laat dit als "https://gebruikersnaam.github.io" (geen pad). Pas aan indien nodig.

const CHUNK_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB per chunk (meerder van 256 KB)
const MAX_RETRIES_PER_CHUNK = 5; // aantal herpogingen per chunk bij fout
const CONCURRENT_UPLOADS = 2; // 1 of 2 uploads tegelijk op mobiele netwerken
const RETRY_BASE_DELAY_MS = 800; // basis voor exponential backoff (vermenigvuldigd per poging)
