export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname.length > 256) {
            return new Response("URL Too Long", { status: 414 });
        }

        if (url.pathname.startsWith("/2014")) {
            return Response.redirect(
                `https://web.archive.org/web/20150915024420/http://www.seisei51st.com/${url.pathname.substring(6)}`,
                301,
            );
        }
        if (url.pathname.startsWith("/2009")) {
            return Response.redirect(
                "https://web.archive.org/web/20090909062151/http://www.seisei45.org/home.html",
                301,
            );
        }
        if (url.pathname.startsWith("/2008")) {
            return Response.redirect(
                `https://web.archive.org/web/20080918072948/http://seiseisai44.net/${url.pathname.substring(6)}`,
                301,
            );
        }
        if (url.pathname.startsWith("/2003")) {
            return Response.redirect(
                "https://web.archive.org/web/20030810195250/http://www.tdj.ac.jp/seito/seisei/",
                301,
            );
        }
        if (url.pathname.startsWith("/2002")) {
            return Response.redirect(
                `https://web.archive.org/web/20020808060607/http://seisei.info/${["/2002", "/2002/"].includes(url.pathname) ? "tdj/" : url.pathname.substring(6)}`,
                301,
            );
        }

        async function assetsFetch(path) {
            const assetUrl = new URL(path, url.origin);
            assetUrl.search = url.search;
            let responce = await env.ASSETS.fetch(
                new Request(assetUrl, request),
            );

            if (
                path === "/404" ||
                path === "/404/" ||
                path === "/2026/404" ||
                path === "/2026/404/" ||
                path === "/2025/404" ||
                path === "/2024/404/404" ||
                path === "/2023/404/404" ||
                path === "/2021/error/404"
            ) {
                // Return 404 status for custom 404 pages
                const newHeaders = new Headers(responce.headers);
                newHeaders.set("X-Robots-Tag", "noindex, nofollow");
                return new Response(responce.body, {
                    status: 404,
                    headers: newHeaders,
                });
            }

            if (responce.status === 404) {
                const filename = path.split("/").at(-1);
                if (!filename.includes(".")) {
                    const retryUrl = new URL(`${path}/${filename}`, url.origin);
                    retryUrl.search = url.search;
                    responce = await env.ASSETS.fetch(
                        new Request(retryUrl, request),
                    );
                }
            }

            if (responce.status === 404) {
                // Custom 404 handling
                if (path.startsWith("/2026/")) {
                    return assetsFetch("/2026/404/");
                }
                if (path.startsWith("/2025/")) {
                    return assetsFetch("/2025/404");
                }
                if (path.startsWith("/2024/") || path.startsWith("/2023/")) {
                    return assetsFetch(`${path.substring(0, 5)}/404/404`);
                }
                if (path.startsWith("/2021/")) {
                    return assetsFetch("/2021/error/404");
                }
                if (!/^\/\d{4}(?:\/|$)/.test(path)) {
                    return assetsFetch("/404/");
                }

                const headers = new Headers();
                headers.set("X-Robots-Tag", "noindex, nofollow");
                return new Response("Not Found", { status: 404, headers });
            }

            const contentType = responce.headers.get("content-type") || "";
            if (
                path.startsWith("/2025/") &&
                (path.endsWith("/opengraph-image") ||
                    path.endsWith("/twitter-image"))
            ) {
                const newHeaders = new Headers(responce.headers);
                newHeaders.set("Content-Type", "image/png");
                return new Response(responce.body, {
                    status: responce.status,
                    headers: newHeaders,
                });
            }
            if (contentType.includes("text/html")) {
                const newHeaders = new Headers(responce.headers);
                newHeaders.set("X-Robots-Tag", "noindex, nofollow");
                return new Response(responce.body, {
                    status: responce.status,
                    headers: newHeaders,
                });
            }
            return responce;
        }

        // Rewrite /YYYY to /YYYY/
        if (/^\/\d{4}$/.test(url.pathname)) {
            return assetsFetch(`${url.pathname}/`);
        }
        // Serve the current static site at the root; keep year archives below.
        if (!/^\/\d{4}\/.*$/.test(url.pathname)) {
            return assetsFetch(url.pathname);
        }
        // Redirect /YYYY/ to /YYYY
        if (/^\/\d{4}\/$/.test(url.pathname)) {
            return Response.redirect(
                `${url.origin}${url.pathname.slice(0, -1)}${url.search}`,
                301,
            );
        }
        // Redirect /YYYY/index.html or /YYYY/index to /YYYY
        if (/^\/\d{4}\/index(\.html)?$/.test(url.pathname)) {
            return Response.redirect(
                `${url.origin}${url.pathname.replace(/\/index(\.html)?$/, "")}${url.search}`,
                301,
            );
        }
        // Redirect /YYYY/something/something.html to /YYYY/something
        if (
            /^\/\d{4}\/(?:[^/]+\/)*([^/]+)\/\1(?:\.html)?$/.test(url.pathname)
        ) {
            return Response.redirect(
                `${url.origin}${url.pathname.replace(/\/([^/]+)(?:\/\1(?:\.html)?)$/, "/$1")}${url.search}`,
                301,
            );
        }
        // Redirect /YYYY/something.html to /YYYY/something
        if (/^\/\d{4}\/.+\.html$/.test(url.pathname)) {
            return Response.redirect(
                `${url.origin}${url.pathname.replace(/\.html$/, "")}${url.search}`,
                301,
            );
        }
        // Rewrite /2016/sp to /2016/sp/
        if (url.pathname === "/2016/sp") {
            return assetsFetch("/2016/sp/");
        }
        // Redirect /2016/sp/ to /2016/sp
        if (url.pathname === "/2016/sp/") {
            return Response.redirect(`${url.origin}/2016/sp${url.search}`, 301);
        }

        return assetsFetch(url.pathname);
    },
};
