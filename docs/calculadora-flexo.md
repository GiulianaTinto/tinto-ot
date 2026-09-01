# Calculadora Flexo — Documentación de cálculos

Esta calculadora determina cuántos **metros lineales de sustrato** se necesitan para imprimir un pedido de etiquetas en formato flexográfico (bobina), la **cantidad de bobinas** necesarias y el **ancho de sustrato** requerido.

## 1. Datos que ingresa el usuario

**Datos de la etiqueta:**

| Campo | Descripción |
|---|---|
| Tipo de etiqueta | Frente, Contra, Medalla, Collarín u Otro |
| Cantidad de etiquetas | cantidad total del pedido |
| Ancho etiqueta (mm) | medida en la dirección de avance del papel |
| Alto etiqueta (mm) | medida transversal |
| Gap avance (mm) | espacio entre etiquetas en el sentido de avance |
| Gap alto (mm) | espacio entre filas |
| Gap extremos (mm) | margen a cada lado del sustrato |
| Filas | cantidad de etiquetas en paralelo (a lo ancho del sustrato) |

**Scrap de arranque:**

| Campo | Descripción |
|---|---|
| Setup (m) | metros de arranque de máquina |
| PDM (m) | metros de pie de máquina / ensayo |

**Bobinas:**

| Campo | Valor por defecto | Descripción |
|---|---|---|
| Metros por bobina de sustrato | 1500 m | largo de cada bobina de material virgen |
| Metros de folia usados | 0 | 0 si el trabajo no lleva folia (estampado en frío) |
| Metros por bobina de folia | 3000 m | 0 si no aplica |

## 2. Cálculo del ancho de sustrato

```
anchoSustrato = (filas × altoEtiqueta) + ((filas − 1) × gapAlto) + (2 × gapExtremos)
```

Suma el alto de todas las filas, más los espacios (gaps) entre filas, más el margen a cada uno de los dos extremos del sustrato. A diferencia de la calculadora HP, este valor **no se redondea** a un ancho de bobina estándar — se muestra el valor exacto calculado.

**Ejemplo:** 4 filas de 50 mm de alto, gap alto 3 mm, gap extremos 5 mm:
```
anchoSustrato = (4 × 50) + (3 × 3) + (2 × 5) = 200 + 9 + 10 = 219 mm
```

## 3. Porcentaje de scrap según cantidad del pedido

Antes de calcular metros, se determina qué porcentaje de etiquetas adicionales hay que producir de más (por mermas típicas de la tirada), según un escalonado por volumen:

| Cantidad de etiquetas (qty) | % de etiquetas extra |
|---|---|
| 1.000 – 5.000 | 5 % |
| 5.001 – 10.000 | 25 % |
| 10.001 – 100.000 | 12 % |
| 100.001 – 500.000 | 3 % |
| 500.001 – 1.000.000 | 1 % |
| fuera de estos rangos (menor a 1.000) | 1 % |

```
etiquetasExtra = TECHO(cantidadPedida × %scrap / 100)
totalEtiquetas = cantidadPedida + etiquetasExtra
```

**Nota:** el rango 5.001–10.000 tiene el porcentaje más alto (25 %) de forma intencional en la lógica actual — es un salto respecto al resto de la escala, no un error de tipeo.

## 4. Cálculo de metros lineales

**Paso 1 — Pitch (paso de avance en metros):**
```
pitch = (anchoEtiqueta + gapAvance) / 1000
```

**Paso 2 — Etiquetas por fila (repeticiones necesarias a lo largo del sustrato):**
```
etiquetasPorFila = TECHO(totalEtiquetas / filas)
```
Se reparte el total de etiquetas (incluyendo el extra por scrap) entre la cantidad de filas en paralelo, redondeando hacia arriba.

**Paso 3 — Metros brutos:**
```
mBrutos = etiquetasPorFila × pitch
```

## 5. Scrap por cambio de bobina de sustrato

Cada vez que se agota una bobina de sustrato hay que empalmar la siguiente, y ese empalme genera una pérdida fija de **50 metros** por cambio.

```
cambiosSustrato = PISO(mBrutos / metrosPorBobinaSustrato)
scrapSustrato   = cambiosSustrato × 50
```

## 6. Scrap por cambio de bobina de folia (si aplica)

Si el trabajo usa folia (`metrosFolia > 0` y `metrosPorBobinaFolia > 0`), se suma el mismo criterio de 50 metros por cada cambio de bobina de folia:

```
scrapFolia = PISO(metrosFolia / metrosPorBobinaFolia) × 50
```

Si no aplica folia, este valor es 0.

## 7. Resultado final

```
mTotal = REDONDEO(mBrutos + setup + pie + scrapSustrato + scrapFolia)
```

Y la cantidad de bobinas de sustrato a pedir/reservar:
```
bobinasNecesarias = TECHO(mTotal / metrosPorBobinaSustrato)
```

## 8. Resumen visual del flujo

```
Filas, alto etiqueta,
gaps de alto/extremos ──────────────────────────────────────→ Ancho de sustrato

Cantidad de etiquetas ──→ % scrap por rango ──→ etiquetasExtra ──→ totalEtiquetas
                                                                        │
Ancho etiqueta + gap avance ──→ pitch                                  │
                                    │                                  │
                                    └──────────→ etiquetasPorFila ←─────┘
                                                       │
                                                       ▼
                                                    mBrutos
                                                       │
                        ┌──────────────────────────────┼───────────────────────┐
                        │                               │                       │
                 setup + pie              scrapSustrato (cambios × 50m)   scrapFolia (si aplica)
                        │                               │                       │
                        └───────────────────────────────┴───────────────────────┘
                                                    │
                                                    ▼
                                                 mTotal ──→ bobinasNecesarias
```
