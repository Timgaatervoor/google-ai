# Stamhoofd Deelnemers Import

## Functionaliteiten
- **Bestandsformaten**: CSV, XLSX, XLS.
- **Scheidingstekens**: Automatische detectie van komma (,), puntkomma (;), en tab (\t).
- **Codering**: Volledige ondersteuning voor UTF-8 en UTF-8 BOM.
- **Slimme Veldherkenning**:
  - `Voornaam`, `First name`, `firstname` -> `firstName`
  - `Achternaam`, `Last name`, `Family name` -> `lastName`
  - `Startnummer`, `Bib`, `Nummer` -> `bibNumber`
  - `Categorie`, `Category` -> `category`
  - `Geboortedatum`, `Birthdate` -> `birthDate`
  - `Geslacht`, `Gender` -> `gender`
  - `Club`, `Team`, `Ploeg` -> `club`
  - `Stamhoofd ID`, `ID` -> `externalId`
- **Duplicate Handling**:
  - Match op Stamhoofd ID, e-mail, of naam + geboortedatum.
  - Opties: Overslaan, Vervangen, Samenvoegen, Importeren als nieuw.
- **Import Rollback**:
  - Elke import krijgt een `importBatchId` en kan worden teruggedraaid zolang er nog geen live tijden zijn geregistreerd.
