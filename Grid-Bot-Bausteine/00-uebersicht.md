# 00 Übersicht

Der Grid Bot wird aus kleinen Bausteinen gebaut.
Jeder Baustein muss für sich allein verständlich, programmierbar und testbar sein.

## Fester Ablauf

1. Bot-Start: Wenn `Start` gedrückt wird, läuft der Bot im eingestellten Zyklus, z. B. alle `10s`.
2. Jeder Zyklus fragt den aktuellen Preis, offene Phemex-Orders, Quote-Guthaben und Asset-Guthaben ab.
3. Danach wird bestimmt, in welchem Grid-Bereich der aktuelle Preis liegt.
4. Fehlende Buy-Level werden bei genügend freien USDT und mindestens 25 % eines Grid-Abstands unter dem aktuellen Preis nachgesetzt. Am Level darf weder eine Buy- noch eine Sell-Order offen sein. Alte Zyklussperren verhindern dieses Nachsetzen nicht.
5. Wenn eine bekannte Buy-Order verschwunden ist, wird ihr Phemex-Status geprüft.
6. Nur wenn Phemex diese Buy-Order als `Filled` meldet, wird ein Kaufzyklus mit eigener Order-ID für den Folgeverkauf geführt.
7. Für eine gefüllte Buy-Order wird die Sell-Order im nächsthöheren Grid-Bereich vorbereitet.
8. Die Sell-Order wird nur gesetzt, wenn genug Asset-Guthaben vorhanden ist, dort keine Sell-Order offen ist und die 25%-Abstandsregel erfüllt ist.
9. Eine tatsächlich offene Order belegt ihre Preisebene. Ein nur gespeichertes Sell-Ziel belegt sie nicht.
10. Alte Kaufzyklen und ihre Sell-Zuordnungen bleiben erhalten. Ein Nachkauf ist ein neuer, getrennter Zyklus; eine Sell-Order wird nicht mehreren Käufen zugeordnet.
11. Erst wenn Phemex die zugehörige Sell-Order als `Filled` meldet, wird der alte Kaufzyklus abgeschlossen. Ein USDT-Guthaben allein gilt nicht als Verkaufsbestätigung.

## Einfache Handelslogik

- Buy-Orders liegen unterhalb des aktuellen Preises.
- Sell-Orders liegen oberhalb des aktuellen Preises.
- Wenn kein Asset-Guthaben vorhanden ist, wird keine Sell-Order gesetzt.
- Wenn eine Buy-Order abgeholt wurde, wird danach eine Sell-Order im darüberliegenden Grid-Level gesetzt.
- Ein noch offener Verkauf bleibt dem alten Kauf zugeordnet, verhindert aber keine neue Buy-Order an einem freien Level mit ausreichendem Preisabstand und freien USDT.
- Nach bestätigtem Verkauf wird nur der zugehörige alte Kaufzyklus abgeschlossen.

## Sicherheitsprinzip

Wenn eine Prüfung nicht eindeutig ist, wird keine Order gesetzt.
