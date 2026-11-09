// Imágenes de la app (logo, portada, galería, avatar y foto de reseña): se reducen y comprimen en el navegador antes de
// subirlas. Se guardan como data URL en base64 dentro de MongoDB Atlas (plan gratuito: 100 operaciones/s y 0,5 GB), así que
// cada KB cuenta: pesan en la base de datos y en cada respuesta que las incluye.
//
// Los límites de peso repiten los de BarberPlanAPI/src/middleware/validateMiddleware.js (el servidor rechaza lo que los
// supere); la batería de integración comprueba que ambos lados coinciden.

export type TipoImagen = 'logo' | 'avatar' | 'portada' | 'galeria' | 'resena';

// Lado más largo, en píxeles, al que se reduce cada tipo
export const LADO_MAXIMO_PX: Record<TipoImagen, number> = { logo: 256, avatar: 256, portada: 1024, galeria: 800, resena: 800 };
// Peso máximo en KB de la imagen ya comprimida
export const LIMITES_IMAGEN_KB: Record<TipoImagen, number> = { logo: 60, avatar: 40, portada: 150, galeria: 120, resena: 120 };
export const MAX_IMAGENES_GALERIA = 6;

export const CALIDAD_JPEG_INICIAL = 0.7;
const CALIDAD_JPEG_MINIMA = 0.4;
const PASO_CALIDAD = 0.1;
const FACTOR_REDUCCION = 0.85;
const MAX_REDUCCIONES = 3;

// Tamaño y calidad de la imagen: sin ampliar nunca y manteniendo la proporción
export function dimensionesReducidas(ancho: number, alto: number, ladoMaximo: number): { ancho: number; alto: number } {
  const ladoMayor = Math.max(ancho, alto);
  if (ladoMayor <= ladoMaximo) return { ancho, alto };
  const escala = ladoMaximo / ladoMayor;
  return { ancho: Math.max(1, Math.round(ancho * escala)), alto: Math.max(1, Math.round(alto * escala)) };
}

// Bytes que ocupa la imagen de una data URL en base64 (sin la cabecera)
export function bytesDeDataUrl(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - relleno;
}

// Siguiente intento si la imagen sigue pesando de más: primero baja la calidad (hasta el mínimo) y después el tamaño
export function siguienteIntento(calidad: number, lado: number, reducciones: number): { calidad: number; lado: number; reducciones: number } | null {
  if (calidad - PASO_CALIDAD >= CALIDAD_JPEG_MINIMA - 1e-9) {
    return { calidad: Math.round((calidad - PASO_CALIDAD) * 100) / 100, lado, reducciones };
  }
  if (reducciones < MAX_REDUCCIONES) {
    return { calidad: CALIDAD_JPEG_INICIAL, lado: Math.round(lado * FACTOR_REDUCCION), reducciones: reducciones + 1 };
  }
  return null;
}

export const MENSAJE_IMAGEN_DEMASIADO_PESADA = 'La imagen es demasiado pesada. Prueba con otra o con una de menor resolución.';
export const MENSAJE_GALERIA_LLENA = `La galería admite como máximo ${MAX_IMAGENES_GALERIA} imágenes.`;

function cargarImagen(archivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => { URL.revokeObjectURL(url); resolve(imagen); };
    imagen.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    imagen.src = url;
  });
}

// Reduce y comprime la imagen elegida a JPEG dentro de los límites de su tipo. Rellena de blanco el fondo (un PNG con
// transparencia saldría negro en JPEG). Lanza un Error con un mensaje para el usuario si no se puede
export async function comprimirImagen(archivo: File, tipo: TipoImagen): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('El archivo elegido no es una imagen.');

  const imagen = await cargarImagen(archivo);
  const limiteBytes = LIMITES_IMAGEN_KB[tipo] * 1024;
  let intento: { calidad: number; lado: number; reducciones: number } | null = {
    calidad: CALIDAD_JPEG_INICIAL, lado: LADO_MAXIMO_PX[tipo], reducciones: 0
  };

  while (intento) {
    const { ancho, alto } = dimensionesReducidas(imagen.naturalWidth, imagen.naturalHeight, intento.lado);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const contexto = lienzo.getContext('2d');
    if (!contexto) throw new Error('No se pudo procesar la imagen.');
    contexto.fillStyle = '#ffffff';
    contexto.fillRect(0, 0, ancho, alto);
    contexto.drawImage(imagen, 0, 0, ancho, alto);

    const resultado = lienzo.toDataURL('image/jpeg', intento.calidad);
    if (bytesDeDataUrl(resultado) <= limiteBytes) return resultado;
    intento = siguienteIntento(intento.calidad, intento.lado, intento.reducciones);
  }
  throw new Error(MENSAJE_IMAGEN_DEMASIADO_PESADA);
}
