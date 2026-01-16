Deze handleiding beschrijft hoe je de MPOP++ editor gebruikt om items te bekijken en te bewerken.

| Col A | Col B |
|----|---|
| 1     | test  |
| 2     | more  |

---

## Toegang en rollen

- **Editor**: kan alle velden aanpassen en gegevens opslaan.
- **Viewer**: kan items bekijken en audio afspelen, maar kan niet bewerken.

## Inloggen

1. Vul je email en wachtwoord in.
2. Klik op **Sign in**.
3. Na succesvol inloggen verschijnt je rol en de lijst met items.

## Item zoeken en kiezen

- Gebruik het zoekveld om te filteren op code of titel.
- Klik op een item om de gegevens te openen.

## Velden invullen

- Vul de tekstvelden in per pagina.
- Braille velden worden automatisch bijgewerkt op basis van de lettervelden.
- De **Updated** datum wordt in een leesbaar formaat getoond.

## Pagina indeling

- Pagina 1 t/m 11 staan als secties in het formulier.
- Iedere pagina heeft eigen velden voor titel, tekst en opmerkingen.
- Nieuwe paginas 7, 8 en 9 zijn toegevoegd met extra velden.

## Opmerkingen velden

- Pagina 3 bevat **remarks_3**.
- Pagina 4 bevat **remarks_4**.
- Pagina 5 bevat **remarks_5**.
- Pagina 6 bevat **remarks_6**.
- Pagina 7 bevat **remarks_7**.
- Pagina 8 bevat **remarks_8**.
- Pagina 9 bevat **remarks_9**.
- Pagina 10 bevat **remarks_10**.

Zorg dat deze kolommen ook in de database aanwezig zijn.

## Audio afspelen

- Gebruik de **Play** knoppen om audio te beluisteren.
- Als je een andere audio start, stopt de vorige automatisch.

## Afbeeldingen

- Vul een pad in bij een afbeelding veld.
- Er verschijnt een preview als het pad geldig is.
- Klik op de preview om deze groter te bekijken.

## Opslaan en autosave

- Wijzigingen worden automatisch opgeslagen na invoer.
- Bij fouten verschijnt een melding in de interface.

## Handleiding en template

- Klik op **Handleiding** om deze pagina te openen.
- Klik op **Template** voor de PDF template.

## Problemen oplossen

- **Supabase init failed**: controleer of de config bereikbaar is via de API.
- **Stack depth limit exceeded**: controleer RLS policies op recursieve queries.
- **Geen items zichtbaar**: controleer je rol en RLS policies.

## Bestandslocaties

- `index.html`: hoofdapplicatie.
- `readme.html`: toont deze handleiding.
- `readme.md`: bron voor de handleiding (deze file).
- `api/supabase-config.js`: levert Supabase config.
