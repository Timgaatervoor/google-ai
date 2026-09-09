# Stamhoofd API-integratie

De app gebruikt standaard **rechtstreekse browserrequests**, zoals het aangeleverde `stamhoofd_run_biathlon_deelnemers_qr_v10.html`. Geen Cloudflare-account, Worker URL of lokale server nodig. De key wordt alleen voor de huidige ophaalaanvraag gebruikt. Deelnemers, geselecteerde ticketgegevens, veldkeuzes en syncverslagen worden lokaal opgeslagen in dezelfde Dexie-database. Start, finish en schieten blijven offline werken. CSV/Excel-import blijft beschikbaar.

## Eenvoudig synchroniseren (standaard)

1. Open **Deelnemers → Stamhoofd API**. De huidige Run Biathlon-webshop staat al geselecteerd; een eerder gekozen andere webshop blijft behouden.
2. Plak je aparte read-only key in **API-key**.
3. Klik **Synchroniseer deelnemers + QR**. Orders en tickets verschijnen automatisch in de preview. De key wordt na afloop uit het veld gewist, ook bij fouten.
4. Controleer artikel, geboortedatum, leeftijdscategorie en wedstrijdprofiel in de preview. Indien nodig pas je onder **Velden aanpassen (optioneel)** de veldkeuzes aan. Klik **Synchronisatie toepassen**. Deze stap schrijft de deelnemers lokaal en heeft geen key nodig. Importeren kan ook als categorieën of profielen nog niet gekoppeld zijn.

### Artikel, leeftijdscategorie en wedstrijdprofiel

- Het Stamhoofd-ticketproduct wordt altijd als **Artikel** bewaard. De oude product-naar-categorie-instelling wordt niet meer gebruikt.
- Configureer zelf de leeftijdscategorieën met minimum- en maximumleeftijd (inclusief) en eventueel geslacht. Leeftijd is het evenementjaar min het geboortejaar, dus de leeftijd op 31 december. U12 wordt niet op naam geïnterpreteerd: stel bijvoorbeeld minimum 10 en maximum 11 in.
- Selecteer bij ieder **Wedstrijdprofiel** de toepasselijke artikelen en leeftijdscategorieën. Beide moeten passen. Meerdere categorieën kunnen hetzelfde parcours lopen.
- Bij nieuwe imports worden unieke matches automatisch toegekend. Geen match, ontbrekende geboortedatum of meerdere matches blijven zichtbaar als te controleren; er wordt geen standaardprofiel gekozen. Een categorie voor heren/dames vereist een bekend geslacht, of een handmatige categoriekeuze.
- Voor bestaande imports: sla de regels op en klik bij Wedstrijdprofielen **Artikel + leeftijdscategorie toepassen**. Dit werkt zonder nieuwe API-aanvraag. De knop verwerkt alleen actieve geïmporteerde deelnemers vóór de wedstrijd; deelnemers met tijd- of schietregistraties worden overgeslagen. Vergrendelde uitslagen worden niet aangepast.
- In de deelnemersfiche kun je geboortedatum en geslacht corrigeren en categorie/profiel handmatig vastzetten. Uitvinken laat de volgende toepassing van regels weer automatisch indelen. Gewone API-resynchronisatie behoudt bestaande categorie- en profielkeuzes.
- Het scorebord toont een klassement per wedstrijdprofiel, met daarbinnen alle leeftijdscategorieën of een geselecteerde categorie. Rangnummers en verschillen horen bij de gekozen selectie; zoeken verbergt alleen rijen.

Voor 2026: 11/10/1989 geeft leeftijd 37; artikel Lange afstand + categorie Masters kan naar 9 km masters. 07/01/2015 geeft leeftijd 11; artikel Korte afstand + categorie U12 kan naar 4 KM jeugd. De daadwerkelijke namen en grenzen blijven vrij configureerbaar.

Voor een andere webshop open je **Andere webshop of verbinding**, vul je het domein in en kies je **Zoek webshops** en **Gebruik deze webshop**. Webshops zoeken gebruikt de publieke endpoint zonder key.

De key gaat net als in de HTML uitsluitend in de `Authorization: Bearer ...`-header naar de organisatiehost van Stamhoofd, met `Accept: application/json`, `X-Platform: web` en `X-Locale: nl-BE`. Hij staat niet in de broncode, URL, opslag of export, maar is tijdens de aanvraag wel zichtbaar in de netwerkinspectie van je eigen browser. Dit is de bewust gekozen directe werkwijze; de oorspronkelijke eis dat de browser de key nooit mag zien is daarmee vervangen.

Op 7 september 2026 gaf de Stamhoofd-server op een keyloze OPTIONS-controle expliciet toestemming voor `https://timgaatervoor.github.io` en de headers `authorization,x-platform,x-locale`. Later is de appcode met een tijdelijke key live gecontroleerd: 55 orders en 107 tickets over twee ticketpagina’s, zonder lokale import. Daarbij is de v417-cursor gecorrigeerd: `next.pageFilter` is reeds JSON-tekst en mag niet nogmaals met `JSON.stringify` worden gecodeerd. De regressietest controleert dit formaat naast de bestaande objectcursor-test. Als Stamhoofd zijn CORS-beleid later verandert, zijn de lokale koppeling en Worker beschikbaar onder **Andere webshop of verbinding**.

### Controle van de aangeleverde HTML

De HTML gebruikt directe GET-requests naar `/webshop/orders` en `/webshop/tickets/private`. De technische ticketkoppeling via `itemId` is correct. Het voorbeeld bevat geen ingebouwde API-key en schrijft die niet naar browseropslag. Het laat de key wel in het invoerveld staan tot **Wis** wordt ingedrukt.

De app neemt de requests en eenvoudige bediening over, met deze aanvullingen:

- Alle pagina’s worden opgehaald via `next.pageFilter`; de HTML stopt bij de eerste 100 orders/tickets.
- De key wordt automatisch gewist na de ophaalaanvraag.
- Het voorbeeld hergebruikt bij ontbrekende extra tickets `linked[0]`; de app blokkeert zulke meervoudige/ambigue items voor controle, zodat dezelfde ticketcode niet stil aan meerdere personen wordt gekoppeld.
- De HTML markeert een bestelling betaald zodra één betaling Succeeded is. De app houdt de conservatievere controle en laat de beheerder verdachte betalingen beoordelen.
- Producten en velden blijven configureerbaar. Annuleringen verwijderen geen lokale wedstrijdgegevens en QR-codes worden nooit borstnummers.

## Optioneel: lokale koppeling

1. Start de bijgewerkte app via `start-windows.bat` of `start-mac-linux.sh`. Als de app al draait, sluit het startvenster en start opnieuw. De lokale koppeling start automatisch mee; je hoeft geen extra server of Cloudflare in te stellen.
2. Open `http://localhost:3000` en ga naar **Deelnemers → Stamhoofd API → Andere webshop of verbinding**. Kies **Lokale koppeling**.
3. Vul het webshopdomein in, klik **Zoek webshops**, selecteer de webshop en klik **Gebruik deze webshop**. Zoeken vereist geen API-key.
4. Vul je aparte read-only Stamhoofd API-key in bij **API-key** en klik **Synchroniseer deelnemers + QR**. De key wordt alleen gebruikt voor deze ophaalaanvraag, inclusief alle pagina’s met orders en tickets. Het veld wordt na afloop leeggemaakt, ook bij een fout. Voor een nieuwe ophaalaanvraag voer je de key opnieuw in.
5. Kies velden, controleer de indeling in de preview en pas de synchronisatie toe. Artikel- en categoriekoppelingen stel je bij Wedstrijdprofielen in. Deze lokale verwerking heeft geen key nodig.

De key wordt niet opgeslagen: niet in een bestand, Git, IndexedDB, localStorage, backups of de productiebuild. Hij bestaat tijdelijk in het invoerveld en tijdens de ophaalaanvraag. Een volgende aanvraag kan de vorige key niet hergebruiken. Als je met een oudere versie al `.env.stamhoofd.local` had aangemaakt, kun je dat bestand verwijderen; deze versie leest of schrijft het niet meer.

De key gaat in de POST-body alleen naar de lokale server op jouw computer. Die server voegt hem voor deze aanvraag toe aan HTTPS-aanvragen naar Stamhoofd en retourneert hem nooit. Je hebt geen Worker URL of Worker-toegangscode nodig. De koppeling weigert netwerkclients, vreemde Host/Origin-headers en aanvragen zonder de lokale appheader. De key wordt nooit in een URL geplaatst of gelogd.

Gebruik de app op dezelfde computer via `localhost`, niet via een LAN-adres of GitHub Pages. Voor tablets/andere computers kun je de bestaande deelnemerbackup overzetten of de optionele Worker gebruiken. Bestaande browsergegevens op GitHub Pages en localhost zijn gescheiden: zet indien nodig eerst je wedstrijdbackup over via de bestaande herstelfunctie.

Technisch draait `server/stamhoofdLocal.ts` mee met `npm run dev` en `npm run preview`. De lokale route `/api/stamhoofd` hergebruikt de geteste Worker-code voor endpoints, organisatiebeperking en paginering. Alleen `POST /api/stamhoofd/sync` accepteert een key; `GET /api/stamhoofd/webshop/search` gebruikt de publieke webshopzoekfunctie zonder key. Geen enkele start-, finish- of schietactie gebruikt deze route.

## Optioneel: Worker installeren voor GitHub Pages

1. Maak in Stamhoofd via **Instellingen → Experimenten → API-keys** een aparte API-key voor deze toepassing. Geef uitsluitend leesrechten op de benodigde webshop, orders, betalingsgegevens en private tickets. Bewaar de key in een wachtwoordmanager. Zie [Stamhoofd API-documentatie](https://www.stamhoofd.be/docs/api/).
2. Maak een Cloudflare-account aan en installeer/gebruik Wrangler. Voer vanuit de repository uit: `npx wrangler login`. De Worker staat in `worker/index.ts`; `worker/wrangler.toml` is de voorbeeldconfiguratie en kan direct worden gebruikt.
3. Controleer `worker/wrangler.toml`: organisatie `af201d93-dcd6-4cfe-bfc7-ed3d2a209236`, versie `v417`, productie-origin `https://timgaatervoor.github.io` (een origin bevat geen `/Tijdregistratie/`-pad). Een andere organisatie vereist aanpassen van deze serverconfiguratie en een bijbehorende read-only key. Webshops binnen de organisatie zijn vrij selecteerbaar.
4. Voeg encrypted secrets toe via de interactieve invoer van Wrangler:

   ```sh
   npx wrangler secret put STAMHOOFD_API_KEY --config worker/wrangler.toml
   npx wrangler secret put SYNC_ACCESS_TOKEN --config worker/wrangler.toml
   ```

   Maak voor `SYNC_ACCESS_TOKEN` een **andere**, willekeurige toegangscode van minstens 32 tekens, bij voorkeur 32 willekeurige bytes via een wachtwoordmanager. Deel deze alleen met bevoegde wedstrijdbeheerders. Deze code beschermt toegang tot de privé-inschrijvingen; CORS op zichzelf is geen authenticatie. De frontend stuurt uitsluitend deze aparte code naar de Worker. De Stamhoofd API-key verlaat de Worker nooit. Zet geen van beide secrets in commandoargumenten, Git, `.env`, Pages-instellingen of frontendbroncode.
5. Deploy de Worker:

   ```sh
   npx wrangler deploy --config worker/wrangler.toml
   ```

   Neem de `https://...workers.dev`-URL over. Er wordt vanuit deze repository geen Worker automatisch gedeployed. Voor grote webshops: kies een Cloudflare-plan met voldoende subrequests per Worker-aanvraag; een volledige sync kan ruim 100 upstream-aanvragen gebruiken. Controleer de actuele limieten in [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/). Stamhoofd-aanvragen worden opeenvolgend uitgevoerd met ongeveer één aanvraag per seconde; voer geen gelijktijdige syncs vanaf meerdere toestellen uit.

## Gebruik met de optionele Worker

6. Open **Deelnemers → Stamhoofd API → Andere webshop of verbinding** en kies **Cloudflare Worker**. Vul de Worker URL, het webshopdomein (bijvoorbeeld `shop.kidsatletiekdehaan.be`) en de aparte Worker-toegangscode in. Deze toegangscode blijft alleen in het geheugen tot het venster sluit; hij wordt niet opgeslagen. Vul in het Worker-toegangscodeveld nooit de Stamhoofd API-key in.
7. Kies **Zoek webshops**, selecteer de naam/domein/ID en druk **Gebruik deze webshop**. Het domein kan meerdere open webshops opleveren. De huidige webshop kan worden herkend aan `603e808b-9ac6-47cb-933c-bf7b4c66f357`; dit ID is niet hardcoded in de integratie. Als een webshop niet gevonden wordt, controleer domein, publicatie en de serverorganisatie.
8. Haal de deelnemers op. De Worker haalt webshopconfiguratie, alle orders en alle private tickets op. Stel de gewenste velden in. Namen worden automatisch herkend met dezelfde veldnaamsynoniemen als de bestaande CSV-parser; afwijkende velden kun je expliciet kiezen op ID. De indeling volgt dezelfde artikel- en leeftijdsregels als de rechtstreekse import. Nieuwe deelnemers hebben nog geen borstnummer of wave.
9. Kies **Configuratie bewaren en preview tonen**. Controleer aantallen, namen, geboortedata, afstand, bestelling, betaling, ticket en lokale status. Niet-betaalde/onbekende betalingen zijn standaard niet geselecteerd; selecteer deze alleen na controle. De status Betaald vereist dat alle gevonden betalingen Succeeded zijn; dit is geen financiële reconciliatie. Bij twijfel controleer de bestelling in Stamhoofd. Items met meerdere personen/tickets of ontbrekende namen worden geblokkeerd om onjuiste koppelingen te voorkomen.
10. Kies **Synchronisatie toepassen**. Alleen geselecteerde rijen worden verwerkt. De database-transactie schrijft deelnemers, configuratie en het `STAMHOOFD_SYNC`-auditverslag samen. Sluit het venster en zoek een deelnemer op naam, borstnummer of ticket secret. Een volledige ticket-URL kan ook als zoektekst worden gebruikt. In het deelnemersdetail staat **Open ticket**.
11. Controleer offline werking: laad de app eenmaal online tot de service worker gereed is, verbreek internet en heropen de app. Deelnemers, zoeken, start, finish en schieten moeten beschikbaar blijven. Gebruik voor een echte wedstrijd de bestaande backupfunctie. Backups bevatten geselecteerde persoonsgegevens en ticketcodes: bewaar ze zorgvuldig. De Stamhoofd-configuratie wordt meegenomen in nieuwe backups; oude backups blijven leesbaar.

## Gegevensveiligheid en synchronisatiegedrag

- `ticket.secret ≠ borstnummer`. De ticketlink wordt `https://<geselecteerd-domein>/tickets/<secret>`. Een scan in het zoekveld zoekt alleen; er wordt geen start of finish geregistreerd.
- De technische sleutel is lokaal evenement + organisatie + webshop + `itemId`; tickets koppelen via `itemId` en bijbehorend `orderId`. Order- en item-ID zijn verplicht, ook bij minimale veldselectie. Namen/geboortedata worden niet als syncsleutel gebruikt. Bestaande CSV-deelnemers worden niet automatisch aan API-deelnemers gekoppeld; controleer dit bij de eerste API-import om dubbele personen te voorkomen.
- Alleen orders met `Created` gelden als actief; alleen tickets met expliciet `deletedAt: null` worden als actief gebruikt. Annuleringen krijgen een aparte inactiefmarkering. Ook deelnemers zonder wedstrijdgegevens worden nooit hard verwijderd door sync. De lokale wedstrijdstatus blijft behouden. Een ontbrekende order alleen is onvoldoende bewijs van annulering en levert een waarschuwing op.
- Borstnummer, wave, categorie/profiel van bestaande deelnemers, status, opmerkingen, timing, schietresultaten, audit en correcties worden niet overschreven. Voor naam/contact/geboortedatum wordt de laatst geïmporteerde waarde bijgehouden: handmatig gewijzigde lokale waarden blijven staan. De actuele bronwaarden blijven zichtbaar in de preview.
- Alleen geselecteerde optionele velden worden opgeslagen. Uitvinken verwijdert de opgeslagen optionele bronwaarde bij de volgende toegepaste sync. Een niet handmatig aangepaste lokale optionele naam/contactwaarde wordt eveneens verwijderd; verplichte lokale namen blijven bestaan. Reeds gemaakte backups en auditverslagen worden niet herschreven.
- Sync is een volledige snapshot met `next.pageFilter`-paginering; maximaal 5000 orders en 5000 tickets. Een fout of limiet geeft geen gedeeltelijk toepasbare snapshot. Ophalen wijzigt geen deelnemers. Er zijn geen automatische achtergrondverzoeken naar Stamhoofd.
- De Worker staat alleen GET/OPTIONS toe, controleert origin en toegangscode, fixeert upstreamhost/organisatie en volgt geen externe redirects/cursor-URL’s. Responses zijn `no-store`; er worden geen ruwe upstreamfouten of credentials gelogd. Er wordt geen ruwe snapshot in IndexedDB bewaard.

## Fouten en onderhoud

Worker niet bereikbaar kan wijzen op netwerk, timeout of CORS: de browser kan deze oorzaken niet betrouwbaar onderscheiden. Controleer de productie-origin, HTTPS-URL en deployment. Voor lokale frontendtests kun je een aparte test-Worker gebruiken met `ALLOWED_ORIGIN = "http://localhost:3000"`; wijzig daarvoor niet de productie-Worker. Ongeldige API-key of ontoereikende rechten moeten server-side worden hersteld. Verander de API-versie centraal in `wrangler.toml` wanneer Stamhoofd die vereist.

De endpoints en paginationstructuur zijn gecontroleerd aan de [publieke Stamhoofd-broncode](https://github.com/stamhoofd/stamhoofd): `GetWebshopFromDomainEndpoint`, `GetWebshopOrdersEndpoint`, `GetWebshopTicketsEndpoint` en `PaginatedResponse`. Een live eindtest vereist je eigen gedeployde Worker en secrets. De historische aantallen van 7 september zijn geen testasserties.

## Ontwikkelcontrole

```sh
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run check:secrets
```

Op Windows PowerShell met geblokkeerde scripts kun je `npm.cmd` gebruiken. Tests gebruiken `fake-indexeddb` in Node-geheugen met een aparte testdatabasenaam. Ze controleren normalisatie, item/ticketkoppeling, annuleringen, betaling, veilige upsert, pagination, Worker-beveiliging, v2→v3-migratie, CSV-import en de bestaande failsafe-suite. De migratie voegt alleen optionele velden/indexen en een configuratietabel toe.

De tijdelijke key voor de live diagnose is uitsluitend in het geheugen gebruikt en niet in bestanden opgeslagen. Gebruik het hiervoor bedoelde invoerveld; bij Worker-deployment uitsluitend `wrangler secret put`. Frontend/build/history worden op secretpatronen gecontroleerd; bij de live diagnose is daarnaast exact op de gebruikte key gecontroleerd. De automatische tests gebruiken fictieve keys en controleren keyloos zoeken, upstream-authenticatie per aanvraag, het ontbreken van hergebruik na succes/fouten en blokkering van LAN/cross-origin-aanvragen.
