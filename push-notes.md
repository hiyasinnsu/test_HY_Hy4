# GitHub push 認証 診断メモ

対象: `https://github.com/hiyasinnsu/test_HY_Hy4.git`（public、空、defaultBranch=main）
症状: `git ls-remote` が `schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS (0x8009030E)` で失敗。

> 秘密情報は本書に書かない。トークン全文・`extraheader` の base64 全文は、base64 が復号可能（実質トークン）なため記載しない。

## 0. 結論（先に要点）

1. **原因は git の schannel TLS バックエンド**。認証情報・トークンのスコープ・DNS/TLS・リポジトリ状態はいずれも正常（実測）。
2. **回避策は `http.sslBackend=openssl` + 明示 `http.sslCAInfo`**。Git 2.50.1.windows.1 は OpenSSL 3 を同梱しており、この切り替えで schannel を経由しない。
3. **認証ヘッダは環境変数 `GIT_CONFIG_PARAMETERS` が既に供給している**（github.com 用 `http.extraheader` = basic、credential helper 無効化込み）。したがって **`-c http.extraHeader` を追加しない**（Authorization 二重送信の恐れ）。
4. トークンは `repo` / `workflow` を含むスコープを持ち、`/user` は `hiyasinnsu`、対象リポジトリに `push=true`。
5. git の HTTPS が直らない場合の代替は REST **Git Data API** による初期コミット作成（＋必要なら `workflow_dispatch`）。

## 1. 確認済みの事実（読み取りのみ）

### 設定ファイル（`git config --list --show-origin` は worker が git 実行不可のためファイル直読みで代替）
| 項目 | 値 | 出所 |
| --- | --- | --- |
| git | 2.50.1.windows.1 | `git.exe` の VersionInfo |
| `http.sslBackend` | `schannel` | `C:\Program Files\Git\etc\gitconfig` |
| `credential.helper` | `manager` | 同上 |
| `credential.https://dev.azure.com.useHttpPath` | true | 同上 |
| `core.autocrlf` | true | 同上 |
| `init.defaultBranch` | **master**（`git init` は main にならない） | 同上 |
| `http.sslCert` / `http.sslKey` | なし | 全設定ファイル走査 |
| `url.*.insteadOf` | なし | 同上 |
| ユーザー設定 | `user.name=hiyasinnsu`, `user.email=hiyasinnsu2303@gmail.com`, lfs フィルタ, `safe.directory` 群のみ | `C:\Users\川野創太\.gitconfig` |
| OpenSSL バックエンド | **利用可能**（`mingw64/bin/libssl-3-x64.dll`, `libcrypto-3-x64.dll`） | ファイル存在 |
| CA バンドル | `C:/Program Files/Git/mingw64/etc/ssl/certs/ca-bundle.crt` に存在（`mingw64\ssl\certs\` は無い） | ファイル存在 |
| プロキシ | 未設定（`ProxyEnable=0`、関連環境変数なし） | レジストリ / env |

### 環境変数
- `GIT_CONFIG_PARAMETERS`（157 文字）の中身は 2 項目:
  - `credential.helper=` → **credential helper は既に無効化済み**
  - `http.https://github.com/.extraheader=AUTHORIZATION: basic <base64>` → **GitHub 用の認証ヘッダは環境が供給済み**
- その base64 は `x-access-token:` + `$env:GH_TOKEN` と**完全一致**（node 内で文字列比較し true。値は非出力）。
- `GH_TOKEN` == `GITHUB_TOKEN`（40 文字、`gho_` 接頭辞）。`GIT_TERMINAL_PROMPT=0`。

### 認証・経路の実測（git を使わず node 24 / OpenSSL 3.5.7 で検証）
| 検証 | 結果 |
| --- | --- |
| `GET https://api.github.com/user`（bearer） | 200, login=`hiyasinnsu` |
| `X-OAuth-Scopes` | `gist, notifications, read:gpg_key, read:org, repo, user, workflow, write:public_key` → **repo 書き込み / workflow 権限あり** |
| `GET /repos/hiyasinnsu/test_HY_Hy4` | 200, private=false, `permissions.push=true`（admin）, `size=0` |
| `GET .../test_HY_Hy4.git/info/refs?service=git-receive-pack`（basic ヘッダ） | **200** `application/x-git-receive-pack-advertisement`（空リポジトリ広告）＝ push 認証 OK |
| 同上（匿名） | 401 `Basic realm="GitHub"` |
| 同上（bearer で試行） | 401 → Git smart HTTP は **basic** 必須、bearer 不可 |
| `https://github.com/` / `https://api.github.com/` への TLS | 成功（CN=github.com, Sectigo）。ネットワークと証明書検証は健全 |

→ 認証・スコープ・ネットワークは正常。**残る失敗要因は schannel TLS のみ**。

## 2. 推定原因

- schannel は `AcquireCredentialsHandle` でプロセスのクライアント資格情報を取得する。サンドボックス／制限されたユーザーコンテキストでは Windows の crypto/credential ストアへ到達できず `SEC_E_NO_CREDENTIALS` になる。node（OpenSSL）で同一ホストへ TLS できることから、証明書・プロキシの問題ではない。
- Git for Windows 2.50.1 は OpenSSL 3 を同梱しており、`http.sslBackend=openssl` で schannel を迂回できる。
- 認証は環境の `extraheader` で足りているため、切り分け対象は TLS バックエンドだけ。

## 3. 推奨手順（オーケストレータ実行用・未検証）

トークンは `$env:GH_TOKEN` のまま使う。値の表示・保存はしない。

```powershell
# 0) 前提: GIT_TERMINAL_PROMPT=0 は継承済み
$env:GIT_TERMINAL_PROMPT = '0'
$ca = 'C:/Program Files/Git/mingw64/etc/ssl/certs/ca-bundle.crt'

# 1) 読み取りで疎通確認（これが通れば push も通る）
git -c credential.helper= -c http.sslBackend=openssl -c "http.sslCAInfo=$ca" `
    ls-remote https://github.com/hiyasinnsu/test_HY_Hy4.git

# 2) 初期化（init.defaultBranch=master のため main を明示）
git init -b main
git add -A
git commit -m "feat: static danmaku shooter with Pages deploy workflow"
# user.name / user.email は global 設定済みのため -c 不要

# 3) push（環境の extraheader がそのまま認証に使われる）
git remote add origin https://github.com/hiyasinnsu/test_HY_Hy4.git
git -c credential.helper= -c http.sslBackend=openssl -c "http.sslCAInfo=$ca" `
    push -u origin main
```

運用上の注意:
- `GIT_CONFIG_PARAMETERS` は**そのまま残す**（`credential.helper=` と GitHub 用 extraheader が入っており push 認証に必要）。残す場合は **`-c http.extraHeader=...` を足さない**（Authorization 二重送信で 400 になり得る）。
- 環境変数側を使わない場合は、プロセス内で `$env:GIT_CONFIG_PARAMETERS = $null` にしてから明示指定する:

```powershell
$env:GIT_CONFIG_PARAMETERS = $null
$hdr = 'AUTHORIZATION: basic ' + [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("x-access-token:$env:GH_TOKEN"))
$ca  = 'C:/Program Files/Git/mingw64/etc/ssl/certs/ca-bundle.crt'
git -c credential.helper= -c http.sslBackend=openssl -c "http.sslCAInfo=$ca" `
    -c "http.extraHeader=$hdr" `
    push -u origin main
```

- `-c http.sslCAInfo` は保険（openssl バックエンド既定 CA パスが本インストールで解決するか未実測のため明示）。証明書エラー時のみ `-c http.sslVerify=false` を最後の手段とする（MITM 耐性が落ちるため非推奨）。
- コマンドライン `-c` は設定ファイルより優先されるため、グローバル設定（schannel / manager）を書き換える必要はない。`GIT_SSL_BACKEND` という環境変数は存在しない（`http.sslBackend` のみ）。
- push 後は Pages ワークフロー（`.github/workflows/deploy-pages.yml`、main への push で起動）が動く。失敗時は Actions のログを確認。

## 4. 検証状況

| コマンド | 実施 | 結果 |
| --- | --- | --- |
| `git config --list --show-origin` | **未実施**（worker は git 実行不可、host が拒否） | 設定ファイル直読みで代替（§1） |
| `git -c credential.helper= ls-remote ...` | **未実施** | 同上 |
| `git ... -c http.sslBackend=openssl [-c http.sslCAInfo=...] ls-remote ...` | **未実施** | 同上。§3 の 1) でオーケストレータが確認する |
| `GIT_CONFIG_PARAMETERS` を空にした再試行 | **未実施** | 同上 |
| node/OpenSSL による API・smart HTTP 認証、TLS | **実施済み** | §1 の表のとおり |

設計根拠は「schannel を使わない」ことのみ。それ以外の要素（認証ヘッダの有効性、スコープ、DNS/TLS、リポジトリの空状態）は実測済み。

## 5. 代替手段: git の HTTPS が直らない場合（REST Git Data API・手順のみ）

git の HTTP 転送を使わず、node の `fetch`（OpenSSL）から GitHub REST API で初期コミットを作る。認証は全リクエストに `Authorization: bearer $env:GH_TOKEN`。※**リモートを変更する操作のため診断では未実行**（読み取り側の 200 / push 権限 / 空リポジトリのみ実測済み）。

1. **blob 作成**: `POST /repos/hiyasinnsu/test_HY_Hy4/git/blobs` に `{"content": "<base64>", "encoding": "base64"}` → 返る `sha`。ファイルごとに 1 回（`.github/workflows/deploy-pages.yml`, `README.md`, `project.md`, `.gitignore`, `package.json`, `src/**`, `tests/**` など）。
2. **tree 作成**: `POST /repos/hiyasinnsu/test_HY_Hy4/git/trees` に `{"tree": [{"path": "src/main.js", "mode": "100644", "type": "blob", "sha": "<blob sha>"}, ...]}`。空リポジトリなので `base_tree` は付けない（付けるなら既存ツリーの sha）。`path` はリポジトリ直下からの相対パス。
3. **commit 作成**: `POST /repos/hiyasinnsu/test_HY_Hy4/git/commits` に `{"message": "...", "tree": "<tree sha>", "parents": []}` → `sha`。空リポジトリなので `parents` は空配列。
4. **ref 作成**: `POST /repos/hiyasinnsu/test_HY_Hy4/git/refs` に `{"ref": "refs/heads/main", "sha": "<commit sha>"}`。
5. **検証**: `GET /repos/hiyasinnsu/test_HY_Hy4/git/ref/heads/main` が 200、`GET /repos/hiyasinnsu/test_HY_Hy4/contents/README.md?ref=main` が 200。
6. **Pages 再デプロイ**（push 由来の `push` トリガが発火しないため必要）: `.github/workflows/deploy-pages.yml` に `workflow_dispatch` を定義しておき、`POST /repos/hiyasinnsu/test_HY_Hy4/actions/workflows/deploy-pages.yml/dispatches` に `{"ref": "main"}`。`workflow` スコープがあるため実行可能。あるいは Actions 画面から手動実行。公開 URL: `https://hiyasinnsu.github.io/test_HY_Hy4/`。
7. **以後の更新**: `GET /git/ref/heads/main` → `GET /git/commit/<sha>` で `tree.sha` を取得し、`POST /git/trees` に `base_tree` を付けて差分ツリーを作る → 新 commit（`parents: [<前回 sha>]`）→ `PATCH /git/refs/heads/main` で `sha` を更新（fast-forward のみ）。
8. **事故防止**: 実行前に現在の ref sha（空なら無し）を記録し、失敗時は手順 4 で作った ref を `DELETE /git/refs/heads/main` で戻す。

## 6. 未確認事項

1. `http.sslBackend=openssl` で git の HTTPS が実際に通るか（worker は git 実行不可。オーケストレータ側 `ls-remote` で要確認）。
2. openssl バックエンドの既定 CA パスが本インストールで解決するか（`mingw64\ssl\certs` が無いため `http.sslCAInfo` 明示を推奨。未実測）。
3. `GIT_CONFIG_PARAMETERS` と `-c http.extraHeader` を併用した際に Authorization が二重送信されるか（未実測。併用を避ける方針で回避）。
4. サンドボックス外の通常 PowerShell でも schannel が失敗するか（sandbox 固有なら素の `git push` が通る可能性もある）。
5. 本書は診断メモ。コミット対象に含めるかはオーケストレータの判断（不要なら削除してよい）。
