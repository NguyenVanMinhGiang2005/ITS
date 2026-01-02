from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse, PlainTextResponse
import httpx
from urllib.parse import urlparse, urljoin, quote

router = APIRouter(prefix="/proxy", tags=["proxy"])

def _validate_url(url: str) -> str:
    try:
        u = urlparse(url)
        if u.scheme not in ("http", "https"):
            raise HTTPException(status_code=400, detail="Invalid URL scheme")
        return url
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid URL")

@router.get("/image")
async def proxy_image(url: str):
    _validate_url(url)
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail="Upstream error")

    return Response(
        content=r.content,
        media_type=r.headers.get("content-type", "image/jpeg"),
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        },
    )

@router.get("/hls")
async def proxy_hls_playlist(url: str):
    """
    Proxy file .m3u8 và rewrite mọi URI trong playlist để trỏ về /api/proxy/hls/segment
    """
    _validate_url(url)

    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
        r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail="Upstream error")

    text = r.text
    base_url = url

    out_lines = []
    for line in text.splitlines():
        s = line.strip()

        # comment / directive
        if not s or s.startswith("#"):
            # rewrite EXT-X-KEY URI nếu có
            if "URI=" in s and s.startswith("#EXT-X-KEY"):
                try:
                    pre, rest = line.split("URI=", 1)
                    q = '"' if '"' in rest else "'"
                    a = rest.find(q)
                    b = rest.find(q, a + 1)
                    uri_val = rest[a + 1 : b]
                    abs_uri = urljoin(base_url, uri_val)
                    proxied = f'/api/proxy/hls/segment?url={quote(abs_uri, safe="")}'
                    out_lines.append(pre + 'URI="' + proxied + '"' + rest[b + 1 :])
                    continue
                except Exception:
                    pass

            out_lines.append(line)
            continue

        # segment / sub-playlist
        abs_uri = urljoin(base_url, s)
        proxied = f"/api/proxy/hls/segment?url={quote(abs_uri, safe='')}"
        out_lines.append(proxied)

    return PlainTextResponse(
        "\n".join(out_lines), 
        media_type="application/vnd.apple.mpegurl",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        },
    )

@router.get("/hls/segment")
async def proxy_hls_segment(url: str):
    _validate_url(url)

    client = httpx.AsyncClient(follow_redirects=True, timeout=30)
    try:
        req = client.build_request("GET", url, headers={"User-Agent": "Mozilla/5.0"})
        resp = await client.send(req, stream=True)

        if resp.status_code != 200:
            await resp.aclose()
            await client.aclose()
            raise HTTPException(status_code=resp.status_code, detail="Upstream error")

        content_type = resp.headers.get("content-type", "application/octet-stream")

        async def iter_bytes():
            try:
                async for chunk in resp.aiter_bytes():
                    yield chunk
            finally:
                # đóng stream + client khi stream xong
                await resp.aclose()
                await client.aclose()

        return StreamingResponse(
            iter_bytes(), 
            media_type=content_type,
            headers={
                "Access-Control-Allow-Origin": "*",
            }
        )

    except httpx.RequestError as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Proxy error: {e}")
