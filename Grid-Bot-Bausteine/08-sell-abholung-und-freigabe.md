# 08 Sell-Abholung und Freigabe

## Ziel

Nach bestätigter Sell-Ausführung wird der zugehörige Kaufzyklus abgeschlossen. Neue Buy-Orders werden unabhängig davon nach den aktuellen Börsenorders, freien USDT und dem Preisabstand geprüft.

## Eingaben

- bekannte Sell-Order
- offene Spot-Orders
- Quote-Guthaben
- gesperrtes Buy-Level

## Pruefung

- Sell-Order war vorher bekannt.
- Sell-Order ist nicht mehr offen.
- Phemex bestätigt diese Sell-Order als `Filled`; Guthaben allein ist kein Nachweis.
- Sell-Order gehoert zu einem gesperrten Buy-Level.

## Aktion

- Zugehörigen Kaufzyklus abschließen.
- Neue Buy-Order auf diesem Level pruefen.

## Ausgabe

- Sell wurde verkauft.
- Zugehöriger Kaufzyklus wurde abgeschlossen.
- Neue Buy-Order erlaubt oder blockiert.

## Testziel

Eine Verkaufsbestätigung schließt nur den zugehörigen Kaufzyklus ab. Andere Käufe am gleichen Preis und ihre Verkaufszuordnungen bleiben unverändert.
