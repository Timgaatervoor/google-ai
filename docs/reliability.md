# Centrale tijd en extra pc's

Deze versie gebruikt de klok van hetzelfde Supabase-project op alle toestellen. De Windows-systeemklok wordt niet aangepast. Start en finish worden in de app vastgelegd met de gecorrigeerde tijd; bestaande tijden worden niet achteraf verschoven.

## Eenmalig activeren

1. Gebruik de bestaande Supabase-configuratie voor `race_operations` uit [supabase-setup.md](supabase-setup.md).
2. Voer [supabase/reliability.sql](../supabase/reliability.sql) eenmaal uit in de SQL-editor van datzelfde project. Dit voegt de tijdservice en tijdelijke toestelkoppelingen toe. Bestaande wedstrijdgegevens worden niet gewist.
3. Open de app via HTTPS. Stel op de hoofd-pc bij Instellingen de Project URL, publieke anon/publishable key en het huidige Event-ID in en schakel synchronisatie in.
4. Klik op **Tijd opnieuw meten**. Controleer dat **Centrale tijd: gemeten** verschijnt en dat gegevenssynchronisatie geen fout meldt.

De SQL staat ook in de app onder **Toestel koppelen > Eenmalige serverinstelling**. Zonder deze serverfunctie meldt de app dat de tijd niet gemeten is; er wordt geen succesvolle meting gesimuleerd.

## Extra pc toevoegen

Maak eerst op de hoofd-pc het evenement, de deelnemers, categorieën, profielen, borstnummers en startgroepen klaar.

1. Kies bij Instellingen **Koppeling voor nieuw toestel maken**.
2. Open de volledige koppellink op de andere pc of scan de QR-code. De afzonderlijke code werkt alleen als hetzelfde Supabase-project op die pc al ingesteld is.
3. Kies **Evenement ophalen en bekijken**, controleer evenement en deelnemersaantal, en kies de post: start, schieten, finish of scorebord.
4. Kies **Dit evenement gebruiken op deze pc**. De app bewaart eerst een lokale back-up van het oude evenement, neemt de gedeelde voorbereiding over, maakt een eigen toestel-ID en meet de centrale tijd.
5. Controleer op beide pc's de tijdstatus en voer een proefstart, schietregistratie en finish uit met een testevenement.

Elke koppeling is tien minuten geldig en kan eenmaal worden opgehaald. Maak voor elke extra pc een nieuwe koppeling. Ook bekijken verbruikt de code. De voorbereiding is een momentopname: wijzigingen aan profieldefinities, categorieën en de planning worden niet allemaal via wedstrijdoperaties gedeeld. Rond die voorbereiding dus vooraf af; bij latere wijzigingen moeten de andere pc's opnieuw een actuele momentopname krijgen.

## Nauwkeurigheid en internetuitval

De app doet vijf tijdmetingen en gebruikt de meting met de kortste heen-en-terugvertraging, met een correctie voor de geschatte reistijd. Elke minuut wordt opnieuw gemeten. De zichtbare onzekerheid is een schatting; wisselende of asymmetrische netwerkvertraging verhindert gegarandeerde millisecondennauwkeurigheid.

Na een geslaagde meting loopt de gecorrigeerde klok lokaal verder met een monotone browserklok, ook als de Windows-klok verspringt. Na vijf minuten zonder nieuwe meting verschijnt een waarschuwing. De kalibratie wordt niet bewaard over het sluiten of herladen van de app: meet opnieuw voor gebruik. Bij internetuitval blijven registraties lokaal opgeslagen; synchroniseer ze wanneer de verbinding terug is. De startcontrole blokkeert een online wedstrijdstart zonder recente centrale tijdmeting.

## Uitslagen en herstel

- Een wave-start maakt een deelbare startregistratie voor iedere deelnemer.
- Een schietcorrectie vervangt de eerdere ronde in de berekening. Gelijktijdige tegenstrijdige correcties blijven zichtbaar als probleem.
- Straffen volgen de instellingen van de betreffende schietbeurt en het profiel. Bij strafrondes moet het aantal gelopen strafrondes in de deelnemerdetails bevestigd zijn.
- Ontbrekende schietbeurten, dubbele actieve tijden en andere onvolledige resultaten krijgen geen officiële rangschikking.
- Tijdcorrecties bewaren de oorspronkelijke registratie met een intrekking en een vervangende registratie. Een lokale uitslagenvergrendeling blokkeert nieuwe start-, finish- en schietregistraties op dat toestel.
- Afdrukken gebruikt alle deelnemers en echte QR-codes (ticketcode waar beschikbaar, anders borstnummer).

Bewaar voor het evenement ook een gedownloade JSON-back-up buiten de browser. De automatische lokale back-up helpt bij een verkeerde toestelkoppeling, maar beschermt niet tegen het wissen van browseropslag of verlies van de pc.

## Toegang en verificatie

Koppellinks bevatten de publieke projectkey en een willekeurig geheim voor de tijdelijke momentopname; deel ze uitsluitend met de betrokken medewerkers. Toestel-PINs worden niet meegestuurd. De gekozen post is een bedieninginstelling, geen Supabase-gebruikersautorisatie. De nieuwe SQL beperkt de rechtstreekse toegang tot uitnodigingen, maar wijzigt de bestaande toegangsregels voor `race_operations` niet. De brede testpolicies uit de oorspronkelijke installatiehandleiding blijven dus testpolicies; eventgebonden toegang vereist Supabase Auth en passende RLS.

Automatische regressietests gebruiken een afzonderlijke fake-indexeddb-database en gesimuleerde HTTP-antwoorden. Ze controleren klokcorrectie, klokverspringingen, uitval, toestelkoppeling/back-up, schietcorrecties, wave-starts, vergrendeling en meer dan 1.000 synchronisatieoperaties. De SQL moet daarnaast op het echte project worden geïnstalleerd en de tweepc-proef moet op de gebruikte toestellen worden uitgevoerd.
