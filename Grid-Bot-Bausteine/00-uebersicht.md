# 00 Übersicht

Der Grid Bot wird aus kleinen Bausteinen gebaut.
Jeder Baustein muss für sich allein verständlich, programmierbar und testbar sein.

## Fester Ablauf

1. Bot-Start: Wenn `Start` gedrückt wird, läuft der Bot im eingestellten Zyklus, z. B. alle `10s`.
2. Jeder Zyklus fragt den aktuellen Preis, offene Phemex-Orders, Quote-Guthaben und Asset-Guthaben ab.
3. Danach wird bestimmt, in welchem Grid-Bereich der aktuelle Preis liegt.
4. Eine Buy-Order darf nur unter dem aktuellen Preis gesetzt werden, wenn keine Sperre besteht, keine gleiche Order offen ist, keine zugehörige Sell-Order offen ist, die 25%-Abstandsregel erfüllt ist und genug Quote-Guthaben vorhanden ist.
5. Wenn eine bekannte Buy-Order verschwunden ist, wird ihr Phemex-Status geprüft.
6. Nur wenn Phemex diese Buy-Order als `Filled` meldet, wird der Buy-Preisbereich gesperrt.
7. Für eine gefüllte Buy-Order wird die Sell-Order im nächsthöheren Grid-Bereich vorbereitet.
8. Die Sell-Order wird nur gesetzt, wenn genug Asset-Guthaben vorhanden ist, dort keine Sell-Order offen ist und die 25%-Abstandsregel erfüllt ist.
9. An einem Sell-Ziel darf keine Buy-Order auf derselben Preisebene erstellt werden.
10. Solange die Sell-Order fehlt, offen ist oder ihr Status unklar ist, bleibt der ursprüngliche Buy-Bereich gesperrt.
11. Erst wenn Phemex die Sell-Order als `Filled` meldet, wird der Buy-Bereich wieder freigegeben.

## Einfache Handelslogik

- Buy-Orders liegen unterhalb des aktuellen Preises.
- Sell-Orders liegen oberhalb des aktuellen Preises.
- Wenn kein Asset-Guthaben vorhanden ist, wird keine Sell-Order gesetzt.
- Wenn eine Buy-Order abgeholt wurde, wird danach eine Sell-Order im darüberliegenden Grid-Level gesetzt.
- Solange diese Sell-Order nicht verkauft wurde, bleibt das Buy-Level gesperrt.
- Wenn die Sell-Order verkauft wurde, darf das Buy-Level wieder für eine neue Buy-Order genutzt werden.

## Sicherheitsprinzip

Wenn eine Prüfung nicht eindeutig ist, wird keine Order gesetzt.
