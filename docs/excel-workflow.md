# Een evenement voorbereiden met Excel

Open **Deelnemers → Werken met Excel (zonder Stamhoofd)**.

- **Blanco Excel-sjabloon** bevat lege tabbladen met kolomnamen en een invulhandleiding.
- **Ingevuld Excel-werkbestand** bevat alle huidige deelnemers en de voorbereiding, onafhankelijk van de actieve lijstfilters.
- **Volledige herstelback-up** downloadt JSON inclusief de wedstrijdregistraties en logs. Excel is een bewerkbare kopie van de voorbereiding, geen vervanging voor die volledige back-up.

Vul de tabbladen in deze volgorde in:

1. **Evenement:** naam, datum in YYYY-MM-DD, locatie en organisatie.
2. **Profielen:** een unieke code per parcours, de naam en de bijbehorende artikelen. Scheid meerdere artikelen met `|`.
3. **Parcours:** een rij per loopgedeelte, schietproef of finish, met profielcode en volgnummer. Schietproeven hebben een eigen aantal schoten en strafinstellingen.
4. **Categorieen:** leeftijdsgrenzen, geslacht en toegelaten profielcodes. Leeftijd is het evenementjaar min geboortejaar: de leeftijd op 31 december.
5. **Startgroepen:** optioneel, met startuur, capaciteit en eventuele categoriebeperkingen.
6. **Deelnemers:** naam, geboortedatum, geslacht en artikel. Borstnummers mogen leeg blijven. Gebruik `automatic` voor indeling volgens de regels; gebruik `manual` met een categorie- of profielcode voor een bewuste handmatige keuze.

Voorbeeld: in 2026 is iemand geboren op 11/10/1989 voor de indeling 37 jaar. Het artikel ‘Lange afstand’ kan samen met de categorie ‘Masters’ naar profiel ‘9 km masters’ verwijzen. Een deelnemer geboren op 07/01/2015 is 11 jaar en kan met artikel ‘Korte afstand’ via U12 in ‘4 km jeugd’ terechtkomen. Deze regels moeten in de werkmap of de app geconfigureerd zijn; ze zijn geen vaste aannames van het sjabloon.

Lees het bestand weer in via **Excel-werkbestand inlezen** in hetzelfde onderdeel. Bekijk fouten, ontbrekende indelingen en aantallen voordat je op **Voorbereiding importeren** klikt. Het invoeren van een ongeldige datum, dubbele borstnummers of onbekende verwijzingen blokkeert de volledige import. Ontbrekende automatische indelingen worden als aandachtspunt getoond en kunnen daarna in de app worden opgelost.

Laat bestaande codes en Deelnemer-ID's staan bij het bewerken van een export. De app werkt die rijen bij. Lege deelnemer-ID's worden als nieuwe personen behandeld. Rijen uit Excel verwijderen wist niets in de app. Vlak voor toepassen controleert de app of de lokale gegevens sinds het overzicht zijn gewijzigd en bewaart ze een lokale herstelback-up.

Importeren kan alleen tijdens de voorbereiding, zonder gestarte deelnemers, startgroepen, tijden of schietresultaten. Rond de voorbereiding af voordat je de andere pc's koppelt; de Excel-import deelt profieldefinities niet automatisch met al gekoppelde pc's.

Bij **Afdrukken → Papieren noodfiche** kun je de schietproeven selecteren. De kolommen en CSV-export volgen die selectie. Het aantal schoten per deelnemer volgt diens profiel; niet toepasselijke proeven krijgen een streepje.
