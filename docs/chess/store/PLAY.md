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

## 6. Покупки за деньги (Google Play Billing)

В `twa-manifest.json` уже включено `"playBilling": { "enabled": true }` (нужен minSdk 23). После `bubblewrap build`
в Play Console → «Монетизация → Товары → Встроенные товары» создайте **одноразовые (non-consumable)** товары
с такими идентификаторами — игра сама подтянет из Google Play их цены и восстановит покупки на новом телефоне.
Покупка подтверждается библиотекой TWA после `complete('success')`.

| ID товара | Что открывает | Рекомендуемая цена |
|---|---|---|
| `fam_ocean` | семейство «ocean» | 0,99 $ |
| `fam_cats` | семейство «cats» | 0,99 $ |
| `fam_primates` | семейство «primates» | 0,99 $ |
| `fam_birds` | семейство «birds» | 0,99 $ |
| `fam_whales` | семейство «whales» | 0,99 $ |
| `fam_sharks` | семейство «sharks» | 0,99 $ |
| `fam_flowers` | семейство «flowers» | 0,99 $ |
| `fam_trees` | семейство «trees» | 0,99 $ |
| `fam_cereals` | семейство «cereals» | 0,99 $ |
| `fam_carnivorous` | семейство «carnivorous» | 0,99 $ |
| `fam_succulents` | семейство «succulents» | 0,99 $ |
| `fam_capfungi` | семейство «capfungi» | 0,99 $ |
| `fam_oddfungi` | семейство «oddfungi» | 0,99 $ |
| `fam_poisonfungi` | семейство «poisonfungi» | 0,99 $ |
| `fam_farmfungi` | семейство «farmfungi» | 0,99 $ |
| `fam_treefungi` | семейство «treefungi» | 0,99 $ |
| `fam_cocci` | семейство «cocci» | 0,99 $ |
| `fam_rods` | семейство «rods» | 0,99 $ |
| `fam_cyano` | семейство «cyano» | 0,99 $ |
| `fam_spiro` | семейство «spiro» | 0,99 $ |
| `fam_actino` | семейство «actino» | 0,99 $ |
| `fam_phages` | семейство «phages» | 0,99 $ |
| `fam_virions` | семейство «virions» | 0,99 $ |
| `fam_giantvir` | семейство «giantvir» | 0,99 $ |
| `fam_plantvir` | семейство «plantvir» | 0,99 $ |
| `fam_archvir` | семейство «archvir» | 0,99 $ |
| `fam_stone` | семейство «stone» | 1,99 $ |
| `fam_iron` | семейство «iron» | 1,99 $ |
| `fam_industrial` | семейство «industrial» | 1,99 $ |
| `fam_human` | семейство «human» | 1,99 $ |
| `fam_tech` | семейство «tech» | 1,99 $ |
| `kingdom_animals` | всё царство «Животные» | 2,99 $ |
| `kingdom_plants` | всё царство «Растения» | 2,99 $ |
| `kingdom_fungi` | всё царство «Грибы» | 2,99 $ |
| `kingdom_bacteria` | всё царство «Бактерии» | 2,99 $ |
| `kingdom_viruses` | всё царство «Вирусы» | 2,99 $ |
| `kingdom_humans` | всё царство «Люди» | 6,99 $ |

Без Google Play (в браузере) кнопки 💳 показывают подсказку, а за монеты всё работает как обычно.

Экономика монет: задача дня 30 🪙 + ежедневный подарок 20 🪙 (месяц ≈ 1 500 🪙 = одно семейство), звезда в кампании 10 🪙,
босс главы 100 🪙 (вся кампания ≈ 3 500 🪙 = 2–3 семейства), победа над компьютером 3 🪙 × уровень. Семейство — 1 500 🪙
(животные — 1 800 🪙), отдельная фигура — 150–450 🪙, царство — сумма его семейств, эпоха людей — 99 999 🪙 и открывается
за монеты только после покупки всех семейств природы. Онлайн-арена (когда появится): 150 🪙 за победу — 10 побед ≈ семейство.
