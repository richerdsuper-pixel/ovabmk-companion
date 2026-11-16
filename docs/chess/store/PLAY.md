# Как выпустить «Шахматы царств» в Google Play

Игра — веб-приложение (PWA). В Google Play она попадает как Trusted Web Activity:
маленькое Android-приложение, которое открывает сайт игры на весь экран без адресной строки.
Google Play принимает только формат AAB; его собирает Bubblewrap.

## 1. Опубликовать сайт
1. Влить ветку в основную. GitHub Pages соберёт `docs/`, игра откроется по адресу
   https://richerdsuper-pixel.github.io/ovabmk-companion/chess/
2. Проверить на телефоне в Chrome: меню → «Установить приложение», игра работает без интернета.

## 2. Собрать AAB (на своём компьютере, один раз)
Нужны Node.js 18+ и JDK 17 (Bubblewrap сам предложит скачать JDK и Android SDK).

```bash
npm i -g @bubblewrap/cli
mkdir kingdoms-chess && cd kingdoms-chess
cp /путь/к/репозиторию/docs/chess/store/twa-manifest.json .
bubblewrap build
```
При первой сборке Bubblewrap создаст ключ подписи `android.keystore` — спросит пароль и данные.
**Сохраните файл ключа и пароль: без них нельзя будет выпускать обновления.**

На выходе: `app-release-bundle.aab` (для Google Play) и `app-release-signed.apk` (для проверки на своём телефоне).

## 3. Связать приложение с сайтом
Иначе в приложении останется адресная строка Chrome.
```bash
keytool -list -v -keystore android.keystore -alias kingdomschess | grep SHA256
```
Полученный отпечаток (вид `AA:BB:CC:…`) вписать в `docs/.well-known/assetlinks.json`
вместо заглушки, закоммитить и дождаться обновления Pages. Проверка:
https://richerdsuper-pixel.github.io/ovabmk-companion/.well-known/assetlinks.json

## 4. Google Play Console
1. Аккаунт разработчика: https://play.google.com/console — разовый взнос 25 $.
2. «Создать приложение» → название «Шахматы царств», игра, бесплатно.
3. Карточка магазина: тексты из `LISTING.md`, значок `icon-512.png`,
   баннер `feature-graphic.png` (1024×500), скриншоты из `screenshots/` (минимум 2, у нас 6).
4. Политика конфиденциальности: https://richerdsuper-pixel.github.io/ovabmk-companion/chess/privacy.html
5. Анкеты: «Безопасность данных» — данные не собираются; IARC — для всех; реклама — нет.
6. Новому личному аккаунту перед релизом нужен **закрытый тест: 12 тестировщиков 14 дней подряд**.
   Создайте закрытое тестирование, загрузите AAB, добавьте e-mail тестировщиков, разошлите ссылку.
7. После теста — заявка на доступ к продакшену, затем «Релиз в продакшен».

## 5. Обновления
Сайт обновляется сам при каждом пуше в основную ветку — приложение подтянет новую версию.
AAB нужно пересобирать только если меняется значок, название или настройки в `twa-manifest.json`:
увеличить `appVersionCode` и `appVersionName`, `bubblewrap update && bubblewrap build`.
