# Calculadora HP Indigo — Documentación de cálculos

Esta calculadora determina cuántos **metros lineales de sustrato** se necesitan para imprimir un pedido de etiquetas en la máquina digital HP Indigo, y qué **ancho de bobina** hay que usar.

## 1. Datos que ingresa el usuario

| Campo | Descripción |
|---|---|
| Tipo de etiqueta | Frente, Contra, Medalla, Collarín u Otro |
| Ancho etiqueta (mm) | medida en la dirección de avance del papel |
| Alto etiqueta (mm) | medida transversal |
| Gap avance (mm) | espacio entre etiquetas en el sentido de avance |
| Gap alto (mm) | espacio entre columnas |
| Columnas | cantidad de etiquetas una al lado de la otra |
| Cantidad de etiquetas | cantidad total del pedido |
| Pruebas adicionales / PDM | Sí / No |
| Stamping / Serig. / Relieve | Sí / No — indica si la etiqueta lleva alguno de estos acabados; define el porcentaje de merma (ver sección 6) |

## 2. Parámetros de planta (configurables)

Estos valores son fijos por defecto pero se pueden ajustar desde "⚙ Config planta". Aplican a todos los cálculos.

| Parámetro | Valor por defecto |
|---|---|
| Hojas de calce inicio | 20 m |
| Hojas de calce final | 20 m |
| Merma adicional | 3 % |
| Motivos | 1 |
| Calibración papel y color | 10 m |
| Intentos de impresión | 5 |

Y dos constantes fijas en el sistema (no editables):

| Constante | Valor |
|---|---|
| Cilindro de la máquina | 980 mm |
| Metros por frame | 0.98 m |
| Metros por intento de impresión | 6 m |

## 3. Margen de sustrato (automático)

El margen ya no se ingresa manualmente: se asigna solo según el tipo de etiqueta.

```
margenSustrato = 16 mm   si tipoEtiqueta = "Contra"
margenSustrato = 22 mm   para cualquier otro tipo
```

## 4. Cálculo del ancho de sustrato

**Paso 1 — Ancho calculado (real):**

```
anchoCalculado = (columnas × altoEtiqueta) + ((columnas − 1) × gapAlto) + margenSustrato
```

Suma el alto de todas las columnas, más los espacios (gaps) entre ellas, más el margen del sustrato.

**Paso 2 — Redondeo a ancho de bobina estándar:**

El `anchoCalculado` se redondea hacia arriba al primer ancho estándar de bobina que lo pueda contener:

| Si anchoCalculado es... | El ancho de sustrato es... |
|---|---|
| ≤ 200 mm | 200 mm |
| ≤ 250 mm | 250 mm |
| ≤ 280 mm | 280 mm |
| ≤ 300 mm | 300 mm |
| ≤ 330 mm | 330 mm |
| > 330 mm | ⚠ se muestra la advertencia "Error en ancho de sustrato" (el pedido no entra en ningún ancho de bobina disponible) |

**Ejemplo:** 3 columnas de 60 mm de alto, gap de alto 3 mm, margen 22 mm (etiqueta que no es "Contra"):
```
anchoCalculado = (3 × 60) + (2 × 3) + 22 = 180 + 6 + 22 = 208 mm
anchoSustrato  = 250 mm   (primer estándar ≥ 208)
```

## 5. Cálculo de metros lineales

**Paso 1 — Paso lineal (mm que ocupa cada fila de etiquetas):**
```
pasoMm = anchoEtiqueta + gapAvance
```

**Paso 2 — Filas que entran por cada vuelta del cilindro (frame):**
```
filasPorFrame = PISO(980 / pasoMm)
```
El cilindro de la máquina mide 980 mm fijos; se calcula cuántas filas de etiquetas entran en esa vuelta, redondeando siempre hacia abajo (no pueden entrar filas incompletas).

**Paso 3 — Etiquetas que salen por frame:**
```
etiquetasPorFrame = filasPorFrame × columnas
```

**Paso 4 — Frames necesarios para todo el pedido (valor de referencia):**
```
framesNetos = TECHO(cantidadEtiquetas / etiquetasPorFrame)
```
Se redondea siempre hacia arriba: aunque sobre lugar en el último frame, igual hay que imprimirlo completo. Este valor, junto con `filasPorFrame` y `etiquetasPorFrame`, se sigue mostrando en pantalla como referencia técnica, pero ya no interviene en el cálculo de metros productivos.

**Paso 5 — Metros productivos:**
```
mProductivos = (anchoEtiqueta + gapAvance) × cantidadEtiquetas / columnas / 1000
```
Se calcula directamente a partir del paso lineal (ancho de etiqueta + gap de avance) multiplicado por la cantidad de etiquetas, dividido por la cantidad de columnas, y convertido de milímetros a metros (÷1000).

## 6. Cálculo del scrap (material que no es aprovechable)

El scrap es la suma de siete componentes:

| Componente | Fórmula |
|---|---|
| Arranque inicio | valor fijo de planta (Hojas de calce inicio) |
| Arranque final | valor fijo de planta (Hojas de calce final) |
| Merma | `mProductivos × (mermaPct / 100)` — porcentaje sobre lo productivo; el `mermaPct` depende del acabado y la cantidad (ver tabla más abajo) |
| Pruebas adicionales / PDM | si el usuario elige "Sí": 60 m si el tipo de etiqueta es Frente o Collarín, 30 m para el resto. Si elige "No": 0 |
| Motivos | `motivos × 6 m` |
| Calibración papel y color | valor fijo de planta (10 m por defecto) |
| Intentos de impresión | `intentosImpresion × 6 m` |

```
mScrap = mInicio + mFinal + mMerma + mPruebas + mMotivos + mCalibracion + mIntentos
```

**Porcentaje de merma (`mermaPct`):**

| Stamping / Serig. / Relieve | Cantidad de etiquetas | Merma |
|---|---|---|
| No | cualquiera | valor de planta (3 % por defecto, editable en Config planta) |
| Sí | ≤ 3.000 | 10 % |
| Sí | > 3.000 y ≤ 30.000 | 7 % |
| Sí | > 30.000 | valor de planta (3 % por defecto, editable en Config planta) |

En los dos tramos automáticos (10 % y 7 %), el campo "Merma adicional (%)" del panel Config planta se muestra de solo lectura con el valor aplicado. En los demás casos es editable.

## 7. Resultado final

```
mTotal = mProductivos + mScrap
```

Y adicionalmente se muestra el porcentaje que representa el scrap sobre el total:
```
pctScrap = (mScrap / mTotal) × 100
```

## 8. Resumen visual del flujo

```
Datos del pedido ─┬─→ margenSustrato (según tipo etiqueta)
                   │        │
                   │        ▼
                   ├─→ anchoCalculado ──→ anchoEstandar() ──→ Ancho de sustrato
                   │                            │
                   │                    (si > 330mm: advertencia)
                   │
                   ├─→ pasoMm ──→ filasPorFrame ──→ etiquetasPorFrame ──→ framesNetos  (referencia, no interviene en mProductivos)
                   │
                   └─→ mProductivos = (anchoEtiqueta + gapAvance) × cantidad / columnas / 1000
                                                                                                │
Parámetros de planta ──────────────────────────────────────────────→ mScrap ←──────────────────┘
                                                                          │
                                                                          ▼
                                                                       mTotal
```
