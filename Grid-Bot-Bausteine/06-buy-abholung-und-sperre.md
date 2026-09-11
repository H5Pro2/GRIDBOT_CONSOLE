# 06 Buy-Abholung und Sperre

## Ziel

Nach bestätigter Buy-Ausführung wird ein Kaufzyklus anhand der Order-ID geführt. Der intern als Sperre bezeichnete Eintrag schützt die Verkaufszuordnung, verhindert aber keine Wiederauffüllung freier Buy-Level.

## Eingaben

- zuletzt bekannte Buy-Order
- offene Spot-Orders
- Asset-Guthaben
- Grid-Level

## Pruefung

- Buy-Order war vorher bekannt.
- Buy-Order ist nicht mehr offen.
- Asset-Guthaben ist vorhanden.
- Phemex bestätigt den Status `Filled`; derselbe Kauf wird nicht doppelt verarbeitet.

## Aktion

- Kaufzyklus mit eigener Order-ID speichern.
- Buy-Order als abgeholt markieren.
- Sell-Folgeorder im naechst hoeheren Grid-Level vorbereiten.

## Ausgabe

- Buy wurde abgeholt.
- Alter Kaufzyklus bleibt bis zum bestätigten Verkauf erhalten.
- Ziel-Level fuer Sell ist bekannt.

## Testziel

Nachkäufe dürfen bei freien USDT, ausreichendem Preisabstand und freiem Börsenlevel entstehen. Auch mehrere Kaufzyklen am selben Preis bleiben getrennt; bestehende Sell-Orders werden nicht übernommen oder gelöscht.
