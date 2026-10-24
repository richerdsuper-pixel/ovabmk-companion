// Должности для заявки на доступ и папки, которые по ним отмечаются автоматически.
// Администратор видит эти папки уже отмеченными в заявке и может их изменить перед одобрением.
// Папку №15 (материнская смертность) выдать нельзя: она закрыта для всех.
// role: staff — видит только свои папки; deputy / chief_physician — руководители, видят все папки, кроме №15.
window.POSITIONS = [
  { code: "doya_qvp",            ru: "Акушерка СВП (кабинет доя)",                 uz: "ОШП доя хонаси (акушерка)",              role: "staff", folders: [9, 10, 12, 13] },
  { code: "akusher_ginekolog",   ru: "Врач акушер-гинеколог",                      uz: "Акушер-гинеколог шифокор",              role: "staff", folders: [7, 9, 10, 12, 13, 14] },
  { code: "oilaviy_shifokor",    ru: "Семейный врач (СВП)",                        uz: "Оилавий шифокор (ОШП)",                 role: "staff", folders: [5, 8, 9, 10, 13] },
  { code: "patronaj_hamshira",   ru: "Патронажная медсестра",                      uz: "Патронаж ҳамшира",                       role: "staff", folders: [5, 9, 10] },
  { code: "pediatr",             ru: "Врач-педиатр",                               uz: "Педиатр шифокор",                        role: "staff", folders: [4, 5, 17] },
  { code: "neonatolog",          ru: "Врач-неонатолог",                            uz: "Неонатолог шифокор",                     role: "staff", folders: [7, 11, 14, 17] },
  { code: "bolalar_ginekologi",  ru: "Детский гинеколог",                          uz: "Болалар гинекологи",                     role: "staff", folders: [9, 19] },
  { code: "emlash_xonasi",       ru: "Медсестра прививочного кабинета",            uz: "Эмлаш хонаси ҳамшираси",                 role: "staff", folders: [5] },
  { code: "maktab_mtm_hamshira", ru: "Медсестра школы / ДДУ",                      uz: "Мактаб / МТМ ҳамшираси",                 role: "staff", folders: [4] },
  { code: "skrining_markazi",    ru: "Скрининг-центр",                             uz: "Скрининг маркази",                       role: "staff", folders: [11] },
  { code: "akusherlik_kompleksi",ru: "Акушерский комплекс (роддом)",               uz: "Акушерлик комплекси",                    role: "staff", folders: [7, 14, 18] },
  { code: "reproduktiv_markaz",  ru: "Репродуктивный центр",                       uz: "Репродуктив марказ",                     role: "staff", folders: [10, 12] },
  { code: "bosh_akusher",        ru: "Главный акушер-гинеколог",                   uz: "Бош акушер-гинеколог",                   role: "staff", folders: [1, 3, 7, 9, 10, 11, 12, 13, 14, 16] },
  { code: "bosh_pediatr",        ru: "Главный педиатр",                            uz: "Бош педиатр",                            role: "staff", folders: [1, 3, 4, 5, 11, 16, 17] },
  { code: "bosh_terapevt",       ru: "Главный терапевт",                           uz: "Бош терапевт",                           role: "staff", folders: [7, 8, 13] },
  { code: "statistik",           ru: "Статистик",                                  uz: "Статистик",                              role: "staff", folders: [2, 17] },
  { code: "kadrlar",             ru: "Отдел кадров",                               uz: "Кадрлар бўлими",                         role: "staff", folders: [16] },
  { code: "ombor_dorixona",      ru: "Склад / аптека",                             uz: "Омбор / дорихона",                       role: "staff", folders: [14, 18] },
  { code: "arxiv",               ru: "Медицинский архив",                          uz: "Тиббиёт архиви",                         role: "staff", folders: [20] },
  { code: "onalar_olimi",        ru: "Бригада по материнской смертности",          uz: "Оналар ўлими бригадаси",                 role: "staff", folders: [7] },
  { code: "dsenm",               ru: "ДСЭНМ (санэпиднадзор)",                      uz: "ДСЭНМ",                                  role: "staff", folders: [4, 5] },
  { code: "maorif",              ru: "Отдел образования (Маориф)",                 uz: "Маориф бўлими",                          role: "staff", folders: [4, 19] },
  { code: "nikoh",               ru: "ЗАГС (Никоҳ бўлими)",                        uz: "Никоҳ бўлими (ФҲДЁ)",                    role: "staff", folders: [19] },
  { code: "adliya",              ru: "Юстиция (Адлия)",                            uz: "Адлия бўлими",                           role: "staff", folders: [19] },
  { code: "soglom_avlod",        ru: "Фонд «Соғлом авлод учун»",                   uz: "«Соғлом авлод учун» жамғармаси",         role: "staff", folders: [6] },
  { code: "ijtimoiy_himoya",     ru: "Социальная защита",                          uz: "Ижтимоий ҳимоя",                         role: "staff", folders: [6, 8] },
  { code: "bosh_vrach",          ru: "Главный врач",                               uz: "Бош шифокор",                            role: "chief_physician", folders: [] },
  { code: "orinbosar",           ru: "Заместитель главного врача",                 uz: "Бош шифокор ўринбосари",                 role: "deputy", folders: [] },
  { code: "other",               ru: "Другая должность",                           uz: "Бошқа лавозим",                          role: "staff", folders: [] }
];
