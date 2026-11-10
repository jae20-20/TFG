// Solo para pruebas (se carga con NODE_OPTIONS=--require en el servidor que lanza la batería): hace que un nombre de host
// (SHIM_DNS_HOST) resuelva a 127.0.0.1. Así la API conecta con el nombre real del nodo de Atlas, con su SNI y su
// certificado, pero el tráfico pasa por un proxy local que el test puede cortar y reabrir.
const dns = require("node:dns");

const hostRedirigido = process.env.SHIM_DNS_HOST;
if (hostRedirigido) {
    const lookupOriginal = dns.lookup;
    dns.lookup = function lookup(hostname, opciones, callback) {
        if (typeof opciones === "function") {
            callback = opciones;
            opciones = {};
        }
        if (hostname === hostRedirigido) {
            return opciones && opciones.all
                ? callback(null, [{ address: "127.0.0.1", family: 4 }])
                : callback(null, "127.0.0.1", 4);
        }
        return lookupOriginal.call(this, hostname, opciones, callback);
    };
}
