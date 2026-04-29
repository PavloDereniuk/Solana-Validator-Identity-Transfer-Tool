# Solana Validator Identity Transfer Tool

Безпечно переносить identity активного Solana-валідатора між двома вузлами,
без даунтайму голосування.

> Для англомовної версії див. [README.md](README.md).

## Чому це не тривіально

Identity валідатора — це лише keypair. Якщо одночасно дві машини голосують з
одним і тим самим pubkey, протокол вас слешить. Канонічна процедура (mvines
demo / Pumpkin's Pool runbook) дає чотири послідовні кроки, які гарантують,
що staked identity у будь-який момент часу або голосує лише на одній машині,
або не голосує ніде.

Цей тул автоматизує саме цю процедуру і додає preflight-чеки, audit log
у форматі JSONL, та auto-rollback, якщо нова нода не встигає наздогнати
кластер.

## Швидкий старт

```bash
npm i && npm run build

vid init                              # інтерактивний майстер конфіга
vid preflight --config swap-config.json
vid swap      --config swap-config.json [--dry-run] [--tui]
vid status    -H host -k path/to/key
```

`vid init` проводить вас через обидві ноди, питає шляхи до keypair'ів та
(опційно) робить SSH-пробу обох сторін перед тим як записати
`swap-config.json`.

`vid swap --dry-run` друкує точні shell-команди, які був би виконав
справжній свап, з реальними шляхами і resolved staked pubkey. Жодного
state'у валідатора не змінює — це безпечно запускати на live-mainnet
ноді.

`vid swap --tui` запускає весь свап у вбудованому ink-дашборді: дві бічні
панелі для primary/secondary з опитуванням identity та slot кожні 5
секунд, прогрес кроків і live tail аудит-логу.

## Що робить swap

Чотири кроки, у такому порядку:

1. `wait-for-restart-window` на джерелі — чекаємо безпечне вікно (не
   leader, немає pending fork).
2. `set-identity` на unstaked junk-ключ на джерелі. Тепер staked identity
   нікуди не голосує — це той єдиний неминучий розрив.
3. Передаємо `tower-1_9-{pubkey}.bin` з ledger джерела на ledger
   призначення (через base64 над exec-каналом).
4. `set-identity --require-tower {staked-keypair}` на призначенні. Прапор
   `--require-tower` — це остання лінія оборони: він не дасть
   `agave-validator` прийняти identity, якщо tower-файла там немає.

Деталі та обґрунтування рішень — у [docs/safety.md](docs/safety.md).

## Безпека

Перед першим запуском на mainnet:

1. `vid preflight --config <шлях>` має набрати 100. Будь-який `warn`
   або `fail` — спочатку виправити.
2. `vid swap --dry-run` — прочитати кожен рядок виводу, це саме ті
   команди, що виконаються.
3. Прогнати end-to-end на docker mock pair (див. нижче).
4. Прогнати на testnet з не-staked identity.
5. Тільки тоді — на mainnet, і ще краще зі другим оператором на дзвінку.

`--require-tower` за замовчуванням не вимикається, і не варто шукати
прапор, який це робить.

## Локальна розробка

У `docker/` живе mock-середовище з двох Ubuntu-контейнерів зі `sshd`
і bash-стабами для `agave-validator`, `solana`, `solana-keygen`. Цього
достатньо щоб прогнати весь swap-флоу end-to-end без піднімання
справжніх валідаторів.

```bash
bash docker/setup.sh                    # будує образи + генерує SSH ключі
bash docker/bootstrap.sh                # створює keypair'и + initial tower
node dist/cli.js swap --config docker/swap-config.example.json
```

Зупинити: `docker compose -f docker/docker-compose.yml down -v`.

## Документація

- [docs/safety.md](docs/safety.md) — як саме preflight + `--require-tower`
  + auto-rollback захищають від slashing'у, і чого вони НЕ покривають.
- [docs/security.md](docs/security.md) — як `vid` обходиться з ключами і
  SSH-кредами, що пишеться в audit log, threat model.
- [docs/architecture.md](docs/architecture.md) — як організований код,
  чому TS/Node, де додавати нові чеки чи новий validator client.
- [docs/troubleshooting.md](docs/troubleshooting.md) — типові помилки
  з testnet-прогонів і як їх виправляти.

## Ліцензія

MIT, див. [LICENSE](LICENSE).
