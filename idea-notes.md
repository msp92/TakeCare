## TakeCare - MVP

### Główny problem
Śledzenie historii swoich badań medycznych zazwyczaj wymaga odszukania ich na kilku portalach medycznych lub w domu kiedy mowa o papierowych wersjach. Próba ich analizy samemu wymaga przeglądania badań naukowych lub różnej jakości porad w internecie. Wizyty u lekarzy również bywają różne w związku z czym czasem możemy chcieć skonsultować temat z kilkoma specjalistami. Na każdej wizycie jest ryzyko, że nie wiemy lub zapomnimy o co chcieliśmy wypytać albo zapomnimy co mówił i zalecał lekarz. Wraz z upływem czasu starszy kontekst stopniowo się ulatnia.

### Najmniejszy zestaw funkcjonalności
- Prosty system kont użytkowników z logowaniem przez Magic Link
- Import preanonimizowanych plików PDF z jednej placówki medycznej
- Wydobycie tekstu z plików i zapisanie na storage w formacie JSON
- Generowanie prostego raportu w Markdown agregującego badania użytkownika
- Zapis raportu na koncie użytkownika
- Aktualizacja raportu po każdym dodanym badaniu
- Prosta analiza porównawcza tych samych badań w raporcie

### Co NIE wchodzi w zakres MVP
- Tworzenie profilu użytkownika
- Import plików innych niż PDF
- Obsługa obrazów medycznych
- Automatyczna anonimizacja plików PDF
- Obsługa szablonów badań z innych placówek medycznych
- Szersza analiza danych medycznych

### Kryteria sukcesu
- Użytkownik może załadować pliki w formacie PDF
- Wyniki badań są poprawnie ekstrahowane do JSON
- Raporty Markdown poprawnie agregują dane 
- Raporty Markdown aktualizują się na żądanie jeśli pojawiły się nowe badania
- Użytkownik ma dostęp do raportu podczas kolejnej sesji
