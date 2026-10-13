"""Download ProjectData.xlsx from SharePoint with Microsoft Graph (app-only auth).

    python -m pipeline.fetch_sharepoint --out data/ProjectData.xlsx

Reads its settings from environment variables (GitHub Actions secrets):

    AZURE_TENANT_ID      Entra ID tenant (directory) id
    AZURE_CLIENT_ID      app registration (service principal) id
    AZURE_CLIENT_SECRET  client secret of that app
    SHAREPOINT_SITE      e.g.  undp.sharepoint.com:/sites/cafi
    SHAREPOINT_FILE      path inside the site's default document library, e.g.
                         M&E/CAFI Metrics Hub/ProjectData.xlsx

The app needs the Graph application permission Sites.Selected (granted on the
CAFI site only) or Sites.Read.All. Exits 0 without doing anything when the
variables are not set, so the workflow falls back to the committed workbook.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

GRAPH = "https://graph.microsoft.com/v1.0"
REQUIRED = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "SHAREPOINT_SITE", "SHAREPOINT_FILE"]


def _request(url: str, *, data: bytes | None = None, token: str | None = None) -> bytes:
    req = urllib.request.Request(url, data=data)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def token(tenant: str, client_id: str, secret: str) -> str:
    body = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": secret,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }).encode()
    url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    return json.loads(_request(url, data=body))["access_token"]


def download(out: Path) -> bool:
    env = {k: os.environ.get(k, "").strip() for k in REQUIRED}
    missing = [k for k, v in env.items() if not v]
    if missing:
        print(f"SharePoint fetch skipped (not configured: {', '.join(missing)}). Using the committed workbook.")
        return False
    tok = token(env["AZURE_TENANT_ID"], env["AZURE_CLIENT_ID"], env["AZURE_CLIENT_SECRET"])
    site = json.loads(_request(f"{GRAPH}/sites/{env['SHAREPOINT_SITE']}", token=tok))
    path = urllib.parse.quote(env["SHAREPOINT_FILE"].strip("/"))
    content = _request(f"{GRAPH}/sites/{site['id']}/drive/root:/{path}:/content", token=tok)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(content)
    print(f"Downloaded {len(content):,} bytes from SharePoint → {out}")
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=Path("data/ProjectData.xlsx"))
    download(ap.parse_args().out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
