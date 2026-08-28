# 01 Bot-Start Initialisierung

## Ziel

Beim Klick auf `Start` wird der Bot in einen sauberen Startzustand gebracht.

## Eingaben

- Boerse
- API Key
- Secret
- Asset
- Quote
- Grid unten
- Grid oben
- Anzahl Grids
- Asset-Menge
- Grid-Abfragezeit

## Pruefung

- Asset ist gesetzt.
- Quote ist gesetzt.
- API Key ist gesetzt.
- Secret ist gesetzt.
- Grid unten ist gueltig.
- Grid oben ist gueltig.
- Grid oben ist groesser als Grid unten.
- Anzahl Grids ist gueltig.
- Asset-Menge ist groesser als `0`.
- Grid-Abfragezeit ist gueltig.

## Aktion

- Bot wird als aktiv markiert.
- Erste Daten-Abfrage wird ausgeloest.
- Danach darf erst `Grid erstellen` folgen.

## Ausgabe

- Start erfolgreich.
- Oder Start blockiert mit konkretem Grund.

## Testziel

Der Bot darf nur starten, wenn alle Pflichtwerte vorhanden und gueltig sind.
