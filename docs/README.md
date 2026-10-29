# Документация Синкли

Актуализировано 29 октября 2026 года по `main` (`6c468f5`). [Текущее состояние и покрытие требований](status.md) отделяет реализованные функции, проверенную поставку и оставшиеся ограничения. Статусы задач и ответственные ведутся в [GitHub Issues](https://github.com/souponin-d/psycho/issues).

## Запуск и работа с репозиторием

| Документ                                                     | Назначение                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| [README проекта](../README.md)                               | Продукт, структура, демонстрация и быстрый запуск           |
| [Подготовка рабочего места](team/local-development-setup.md) | Зависимости, команды и границы ролей                        |
| [Правила участия](../CONTRIBUTING.md)                        | Ветки, PR, проверки и независимое ревью                     |
| [Компоненты веба](team/web-components.md)                    | Изолированные примеры и presentation-контракты              |
| [Индекс задач команды](team/backlog.md)                      | Роли и ссылки на исходные задачи; текущий статус — в GitHub |

## Приложения и поставка

| Документ                                                          | Назначение                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Кабинет врача](doctor-workspace-runbook.md)                      | Локальный/серверный режим, доступ, формы, эксплуатация и совместимость   |
| [Android пациента](../apps/mobile-patient/README.md)              | Версия 0.4.5, подключение, сборка, локальные и серверные возможности     |
| [Серверный контур](contracts/mobile-server-web-contour.md)        | Потоки данных, очереди, сессии и ограничения                             |
| [Хакатонный доступ](contracts/hackathon-access.md)                | Вход пациента по коду и изоляция деморежима                              |
| [VPS](../deployment/demo/README.md)                               | Caddy, systemd, обновление и откат синтетического стенда                 |
| [Layero](../deployment/layero/README.md)                          | Веб и Node-прокси `/api` к VPS                                           |
| [Защита медицинских данных](contracts/medical-data-protection.md) | Требования к отдельному медицинскому внедрению; не свидетельство допуска |
| [Сайт проекта](../site/README.md)                                 | Маркетинговый сайт и точки входа в веб-приложения                        |

## Требования, источники и решения

- [Официальный кейс](official/2026-10-15-case.md) — источник требований. [Подготовительный анализ](Клинический-компас_исходное-ТЗ.md) сохранён без изменений.
- [Принятый стек](decisions/0002-product-stack-and-delivery.md), [решения](decisions/README.md), [распределение работ](superpowers/plans/2026-10-19-five-contributor-development.md).
- [Спецификация врача](specifications/doctor-web/2026-10-22-doctor-web-specification.md), [реестр источников](specifications/doctor-web/2026-10-22-source-register.md), [паспорта опросников](specifications/doctor-web/2026-10-24-patient-questionnaire-passports.md).
- [Клинический контекст](clinical-context.md), [оценка → решение → план](clinical-workflow.md), [клиническая поддержка](clinical-support.md), [МКБ-10](icd10-catalog.md), [ГРЛС](grls-catalog.md).
- [Клиническая приёмка](superpowers/specs/2026-10-26-clinical-verification.md), [минимальный ввод врача](superpowers/specs/2026-10-26-doctor-minimal-input-design.md), [конкурсные доработки](superpowers/plans/2026-10-26-contest-remediation-backlog.md). Это критерии, а не текущий статус задач.
- [Клиническая сверка](clinical-validation/2026-10-26-outpatient-psychiatry-review.md), [шкалы](clinical-validation/2026-10-26-scale-evidence.md), [Авиандр](clinical-validation/2026-10-26-aviandr-evidence.md), [сценарий показа](clinical-validation/2026-10-26-demo-guide.md). Исследование не заменяет клиническую подпись.
- [Мобильный дизайн 0.4](design/mobile-patient/v04/README.md) и [происхождение ресурсов](../apps/mobile-patient/assets/sources/v04/README.md).

## Доказательства проверок

- [Интеграция пациента и врача](verification/2026-10-27-patient-doctor-integration.md): локальный сквозной контур и ограничения.
- [Поставка VPS](verification/2026-10-27-vps-integration.md): релиз `20261027-integration-90ee18d`, резервирование, откат и вход APK.
- [APK → VPS → Layero](verification/2026-10-27-doctor-integration-polish.md): назначения, дозы, сообщения, отчёты и опросы.
- [Навигация Android 0.4.5](verification/2026-10-27-mobile-navigation.md), [врачебные входящие](verification/2026-10-27-doctor-daily-copy.md).
- [Инженерные измерения](verification/technical-metrics/README.md): методика, исходные результаты и пределы выводов.
- [Проверка VPS 29 октября](verification/2026-10-29-repository-state.md): доступность стенда, вход врача и сохранность данных.

Датированные документы в `verification/`, `research/`, `clinical-validation/` и `decisions/` сохраняют факты на указанную дату. Текущие ограничения перечислены в [статусе](status.md). Завершённые планы задач и заменённые промежуточные описания удаляются после переноса нужных сведений; их версии остаются в Git.
