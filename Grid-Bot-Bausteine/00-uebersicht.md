# 00 Uebersicht

Der Grid Bot wird aus kleinen Bausteinen gebaut.
Jeder Baustein muss fuer sich allein verstaendlich, programmierbar und testbar sein.

## Einfacher Lauf

1. Bot starten.
2. Aktuellen Preis lesen.
3. Asset- und Quote-Guthaben lesen.
4. Offene Spot-Orders lesen.
5. Grid-Level berechnen.
6. Grid erstellen.
7. Alle `Grid-Abfragezeit` Sekunden Order-Pruefung ausfuehren.

## Einfache Handelslogik

- Buy-Orders liegen unterhalb des aktuellen Preises.
- Sell-Orders liegen oberhalb des aktuellen Preises.
- Wenn kein Asset-Guthaben vorhanden ist, wird keine Sell-Order gesetzt.
- Wenn eine Buy-Order abgeholt wurde, wird danach eine Sell-Order im darueberliegenden Grid-Level gesetzt.
- Solange diese Sell-Order nicht verkauft wurde, bleibt das Buy-Level gesperrt.
- Wenn die Sell-Order verkauft wurde, darf das Buy-Level wieder fuer eine neue Buy-Order genutzt werden.

## Sicherheitsprinzip

Wenn eine Pruefung nicht eindeutig ist, wird keine Order gesetzt.
