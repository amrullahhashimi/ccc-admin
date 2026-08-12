# Bundled data

## tac.csv.gz — IMEI Type Allocation Codes

Maps the first 8 digits of an IMEI to a device brand and model, so the IMEI
checker can name a phone without calling any paid service. ~255,000 entries,
covering devices up to 2026.

Columns: `tac,brand,model,details`

Rebuild / refresh it with:

```
node scripts/build-tacdb.js
```

That downloads the latest list, normalises it (pads TACs that lost their leading
zero, drops junk rows, splits the marketing name out of the spec string) and
rewrites this file. Worth doing once or twice a year so new phones are
recognised; the committed copy keeps working until then.

### Source and licence

Data from [MoazEb/tac-database](https://github.com/MoazEb/tac-database),
used under the MIT License:

> MIT License
>
> Copyright (c) 2026 Moaz Ebrahem
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

### What it can and can't tell you

TAC data identifies the *model* — which handset a number belongs to — plus the
carrier-branded variant where there is one ("T-MOBILE REVVL 5G"), the region
variant, and the release year.

What it cannot answer is anything about the individual handset: whether it is
blacklisted, which network it is on now, whether it is SIM-locked, or whether the
maker's warranty is still running. Those live in the operators' and the GSMA's
systems. No free source publishes them and every provider charges per lookup, so
the checker fills those rows from what it *does* know for free:

- our own stock, sale and repair records for that IMEI (exact, when it's a
  handset we've handled)
- the carrier variant from the TAC
- a manufacturer-warranty verdict from the model's release year

and says plainly where a free answer isn't possible. Nothing in this app ever
bills per use. For a definitive Canadian blacklist answer, DeviceCheck.ca offers a
free *business* lookup — their consumer one forbids commercial use.
