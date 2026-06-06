# Handleiding MPOP++ editor

Deze handleiding beschrijft hoe je de MPOP++ editor gebruikt om items te bekijken en te bewerken.

## Users

### Toegang en rollen

- **Editor**: kan alle velden aanpassen en gegevens opslaan.
- **Viewer**: kan items bekijken en audio afspelen, maar kan niet bewerken.

## Aanmelden

1. Vul je email en wachtwoord in.
2. Klik op **Aanmelden**.
3. Er zal dan een bericht verschijnen in je e-mail box.
4. Bevestig deze e-mail. Je gaat dan naar de website terug.
5. Wil je editor rechten dan stuur je een mail naar edequartel@bartimeus.nl

## Inloggen

1. Vul je email en wachtwoord in.
2. Klik op **Inloggen**.
3. Na succesvol inloggen verschijnt je rol en de lijst met items.

# Items

De items zijn de woorden waar de methode uit bestaat.

## Velden invullen

- Vul de tekstvelden in per pagina.
- Braille velden worden automatisch bijgewerkt op basis van de lettervelden.

## Opmerkingen velden

- Bij elke pagina kun je onderaan opmerkingen toevoegen.
- Bij **Braille algemeen** kun je algemene opmerkingen plaatsen voor de braillepagina's.
- Je kunt **lange klanken**, **klinkers**, **medeklinkers** en **tweeletterklanken** invullen.


## Audio afspelen

- Gebruik de **play/pauze** knop om audio te beluisteren.
- Klik op **Produce** om een tekstblok om te zetten naar één MP3-bestand.

## Audio maken vanuit tekstblokken

In tekstvelden met een **Produce**-knop kun je gesproken tekst combineren met bestaande spraakfragmenten en geluidseffecten.

Gebruik bijvoorbeeld:

```text
Dit is het woord bal. <bal> {snor}
Het woord bal bestaat uit de letters <b,a,l>
Een bal maakt ook een geluid. Het stuitert {stuiter}
```

De Produce-knop verwerkt dit als volgt:

- Gewone tekst, zoals `Dit is het woord bal.`, wordt door ElevenLabs uitgesproken.
- Tekst tussen `<` en `>`, zoals `<bal>`, gebruikt een bestaand MP3-bestand uit `sounds/nl/speech/`.
- Meerdere waarden tussen `<` en `>`, zoals `<b,a,l>`, spelen de losse bestanden `b.mp3`, `a.mp3` en `l.mp3`.
- Tekst tussen `{` en `}`, zoals `{snor}` of `{stuiter}`, gebruikt een bestaand geluid uit `sounds/general/`.
- Alle gesproken tekst en bestaande MP3-fragmenten worden daarna automatisch samengevoegd tot één MP3-bestand.

### Pauzes en uitspraak

- De standaardruimte tussen samengevoegde fragmenten is 0,5 seconde.
- Gebruik bijvoorbeeld `<1_0s>` of `<4_0s>` wanneer daarvoor een bijbehorend spraakfragment bestaat.
- Controleer met de **play/pauze** knop het resultaat nadat Produce klaar is.
- Wanneer een genoemd spraakfragment of geluid niet bestaat, kan Produce het eindbestand niet volledig maken. Geef ontbrekende geluiden door zodat ze toegevoegd kunnen worden.


## Afbeeldingen

- Vul een pad in bij een afbeelding veld.
- Er verschijnt een preview als het pad geldig is.
- Klik op de preview om deze groter te bekijken.

## Opslaan en autosave

- Wijzigingen worden automatisch opgeslagen na invoer.

## PDF's genereren

- Klik op **Handleiding**, **Multimodaal** of **Braille** om de PDF te genereren.
- Tijdens het maken zie je een statusmelding (bijv. "PDF wordt gemaakt...") en een spinner op de knop.
- Bij afronding verschijnt een melding zoals "PDF gereed." en de download start.

## Braillepagina's beheren

- **Toevoegen**: klik op **Braille** pagina toevoegen om een lege pagina toe te voegen.
- **Invoegen**: klik op **Voeg in na** om een pagina tussen te voegen.
- **Verwijderen**: klik op **Verwijder** om een pagina te verwijderen.
- Na toevoegen/invoegen/verwijderen wordt de paginanummering automatisch hernummerd.


## Handleiding en template

- Klik op **Handleiding** om deze pagina te openen.
- Klik op **MPOP versie 1** om de oude MPOP-versie te openen.
- Klik op **Links** om de ontwerp- en tekeningenrichtlijnen te openen, en meer.
