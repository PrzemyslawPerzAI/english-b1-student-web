# English B1 Student Web

Frontend ucznia dla projektu English B1.

## Architektura
- publiczny frontend nie zawiera sekretów;
- dane ucznia są pobierane wyłącznie przez warstwę serwerową/API;
- środowisko testowe używa danych DEV;
- PROD pozostaje odseparowany do czasu zatwierdzonego wdrożenia.

## Security
Nie umieszczaj w repozytorium tokenów, haseł, prywatnych arkuszy ani danych administracyjnych.
Sekrety muszą być przechowywane jako szyfrowane zmienne środowiskowe hostingu.
