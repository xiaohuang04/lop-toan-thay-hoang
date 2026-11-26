#!/usr/bin/env python3
r"""
Zero-Dependency Pure-Python MathType MTEF v5 -> KaTeX LaTeX Decoder
Supports:
- OLE2 Compound Binary File (oleObject*.bin -> 'Equation Native' stream)
- WMF embedded MathType comment (AppsMFCC -> MTEF v5 stream)
- MTEF v5 records: LINE, CHAR, TMPL (fences, fractions, roots, sub/sup, accents/vectors,
  integrals/sums/products, over/under bars, arrows, matrices, boxes), PILE, MATRIX,
  EMBELL (primes, hats, vectors, bars, dots), FONT_DEF, ENCODING_DEF, SIZE, etc.
"""

from __future__ import annotations

import struct


# =============================================================================
# 1. OLE2 COMPOUND BINARY STREAM EXTRACTOR ('Equation Native')
# =============================================================================

def extract_ole_stream(ole_bytes: bytes, target_name: str = "Equation Native") -> bytes | None:
    """Extract a named stream from an OLE2 Compound Binary File (pure Python)."""
    if len(ole_bytes) < 512 or ole_bytes[:8] != b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return None
    try:
        sec_shift = struct.unpack_from("<H", ole_bytes, 30)[0]
        mini_shift = struct.unpack_from("<H", ole_bytes, 32)[0]
        sec_size = 1 << sec_shift
        mini_size = 1 << mini_shift
        first_dir_sec = struct.unpack_from("<I", ole_bytes, 48)[0]
        mini_cutoff = struct.unpack_from("<I", ole_bytes, 56)[0]
        first_minifat_sec = struct.unpack_from("<I", ole_bytes, 60)[0]
        first_difat_sec = struct.unpack_from("<I", ole_bytes, 68)[0]
        num_difat_secs = struct.unpack_from("<I", ole_bytes, 72)[0]

        fat_secs = [s for s in struct.unpack_from("<109I", ole_bytes, 76) if s < 0xFFFFFFFA]
        # Follow extra DIFAT chain if needed
        dsec = first_difat_sec
        seen_d = set()
        for _ in range(min(num_difat_secs, 64)):
            if dsec >= 0xFFFFFFFA or dsec in seen_d:
                break
            seen_d.add(dsec)
            off = (dsec + 1) * sec_size
            if off + sec_size > len(ole_bytes):
                break
            entries_per_sec = sec_size // 4
            vals = struct.unpack_from(f"<{entries_per_sec}I", ole_bytes, off)
            fat_secs.extend(s for s in vals[:-1] if s < 0xFFFFFFFA)
            dsec = vals[-1]

        fat: list[int] = []
        for s in fat_secs:
            off = (s + 1) * sec_size
            if off + sec_size <= len(ole_bytes):
                fat.extend(struct.unpack_from(f"<{sec_size // 4}I", ole_bytes, off))

        def read_chain(start_sec: int) -> bytes:
            out = bytearray()
            s = start_sec
            seen: set[int] = set()
            while s < 0xFFFFFFFA and s not in seen and s < len(fat):
                seen.add(s)
                off = (s + 1) * sec_size
                if off + sec_size > len(ole_bytes):
                    break
                out.extend(ole_bytes[off : off + sec_size])
                s = fat[s]
            return bytes(out)

        dir_bytes = read_chain(first_dir_sec)
        entries = []
        for i in range(0, len(dir_bytes), 128):
            chunk = dir_bytes[i : i + 128]
            if len(chunk) < 128:
                break
            nlen = struct.unpack_from("<H", chunk, 64)[0]
            name = chunk[: max(0, min(64, nlen - 2))].decode("utf-16-le", errors="ignore")
            etype = chunk[66]
            start_s = struct.unpack_from("<I", chunk, 116)[0]
            size = struct.unpack_from("<I", chunk, 120)[0]
            entries.append((name, etype, start_s, size))

        if not entries:
            return None
        root = entries[0]
        mini_stream = read_chain(root[2])[: root[3]]
        minifat: list[int] = []
        if first_minifat_sec < 0xFFFFFFFA:
            mf_bytes = read_chain(first_minifat_sec)
            minifat = list(struct.unpack_from(f"<{len(mf_bytes) // 4}I", mf_bytes, 0))

        for name, _etype, start_s, size in entries:
            if name == target_name:
                if size < mini_cutoff and minifat:
                    out = bytearray()
                    s = start_s
                    seen_m: set[int] = set()
                    while s < 0xFFFFFFFA and s not in seen_m and s < len(minifat):
                        seen_m.add(s)
                        out.extend(mini_stream[s * mini_size : (s + 1) * mini_size])
                        s = minifat[s]
                    return bytes(out[:size])
                return read_chain(start_s)[:size]
    except Exception:
        return None
    return None


def extract_mtef_from_ole(ole_bytes: bytes) -> bytes | None:
    stream = extract_ole_stream(ole_bytes, "Equation Native")
    if not stream or len(stream) < 30:
        return None
    hdr_len = struct.unpack_from("<H", stream, 0)[0]
    if hdr_len >= len(stream):
        return None
    return stream[hdr_len:]


def extract_mtef_from_wmf(wmf_bytes: bytes) -> bytes | None:
    """Extract MTEF binary stream embedded in MathType WMF AppsMFCC comment records."""
    pos = 0
    chunks: list[bytes] = []
    marker = b"AppsMFCC"
    while True:
        idx = wmf_bytes.find(marker, pos)
        if idx < 0:
            break
        # Header: 'AppsMFCC' (8) + version (2) + totalLen (4) + dataLen (4) = 18 bytes
        if idx + 18 > len(wmf_bytes):
            break
        _ver = struct.unpack_from("<H", wmf_bytes, idx + 8)[0]
        _tot_len = struct.unpack_from("<I", wmf_bytes, idx + 10)[0]
        data_len = struct.unpack_from("<I", wmf_bytes, idx + 14)[0]
        sig_start = idx + 18
        # Chunk 1 starts with a NUL-terminated signature (e.g. "Design Science, Inc.\0");
        # data_len counts the MTEF payload bytes AFTER that signature!
        data_start = sig_start
        if not chunks:
            nul = wmf_bytes.find(b"\x00", sig_start, min(len(wmf_bytes), sig_start + 64))
            if nul >= 0:
                data_start = nul + 1
        end = min(len(wmf_bytes), data_start + data_len)
        if data_start < end:
            chunks.append(wmf_bytes[data_start:end])
        pos = max(sig_start + 1, end)
    if not chunks:
        return None
    return b"".join(chunks)


# =============================================================================
# 2. MTEF v5 CHARACTER / MTCODE -> LATEX MAPPING
# =============================================================================

# Standard Unicode + MathType Private Use Area (MTCode) map
MTCODE_TO_TEX: dict[int, str] = {
    0x0020: " ",
    0x00A0: r"\,",
    0x00B0: r"^\circ ",
    0x00B1: r"\pm ",
    0x00B7: r"\cdot ",
    0x00D7: r"\times ",
    0x00F7: r"\div ",
    # Greek uppercase
    0x0393: r"\Gamma ",
    0x0394: r"\Delta ",
    0x0398: r"\Theta ",
    0x039B: r"\Lambda ",
    0x039E: r"\Xi ",
    0x03A0: r"\Pi ",
    0x03A3: r"\Sigma ",
    0x03A6: r"\Phi ",
    0x03A8: r"\Psi ",
    0x03A9: r"\Omega ",
    # Greek lowercase
    0x03B1: r"\alpha ",
    0x03B2: r"\beta ",
    0x03B3: r"\gamma ",
    0x03B4: r"\delta ",
    0x03B5: r"\varepsilon ",
    0x03B6: r"\zeta ",
    0x03B7: r"\eta ",
    0x03B8: r"\theta ",
    0x03B9: r"\iota ",
    0x03BA: r"\kappa ",
    0x03BB: r"\lambda ",
    0x03BC: r"\mu ",
    0x03BD: r"\nu ",
    0x03BE: r"\xi ",
    0x03C0: r"\pi ",
    0x03C1: r"\rho ",
    0x03C3: r"\sigma ",
    0x03C4: r"\tau ",
    0x03C5: r"\upsilon ",
    0x03C6: r"\varphi ",
    0x03C7: r"\chi ",
    0x03C8: r"\psi ",
    0x03C9: r"\omega ",
    0x03D5: r"\phi ",
    # General punctuation & math
    0x2013: "-",
    0x2014: "-",
    0x2022: r"\cdot ",
    0x2026: r"\dots ",
    0x2032: "'",
    0x2033: "''",
    0x2034: "'''",
    0x2102: r"\mathbb{C}",
    0x2115: r"\mathbb{N}",
    0x211A: r"\mathbb{Q}",
    0x211D: r"\mathbb{R}",
    0x2124: r"\mathbb{Z}",
    # Arrows
    0x2190: r"\leftarrow ",
    0x2192: r"\to ",
    0x2194: r"\leftrightarrow ",
    0x21D0: r"\Leftarrow ",
    0x21D2: r"\Rightarrow ",
    0x21D4: r"\Leftrightarrow ",
    # Operators & Logic
    0x2200: r"\forall ",
    0x2202: r"\partial ",
    0x2203: r"\exists ",
    0x2204: r"\nexists ",
    0x2205: r"\varnothing ",
    0x2207: r"\nabla ",
    0x2208: r"\in ",
    0x2209: r"\notin ",
    0x220B: r"\ni ",
    0x2212: "-",
    0x2213: r"\mp ",
    0x2215: "/",
    0x2216: r"\setminus ",
    0x2217: r"\ast ",
    0x2218: r"\circ ",
    0x2219: r"\cdot ",
    0x221A: r"\sqrt",
    0x221D: r"\propto ",
    0x221E: r"\infty ",
    0x2220: r"\widehat{}",
    0x2225: r"\parallel ",
    0x2226: r"\nparallel ",
    0x2227: r"\wedge ",
    0x2228: r"\vee ",
    0x2229: r"\cap ",
    0x222A: r"\cup ",
    0x222B: r"\int ",
    0x2234: r"\therefore ",
    0x2235: r"\because ",
    0x223C: r"\sim ",
    0x2243: r"\simeq ",
    0x2245: r"\cong ",
    0x2248: r"\approx ",
    0x2260: r"\neq ",
    0x2261: r"\equiv ",
    0x2264: r"\le ",
    0x2265: r"\ge ",
    0x226A: r"\ll ",
    0x226B: r"\gg ",
    0x2282: r"\subset ",
    0x2283: r"\supset ",
    0x2284: r"\not\subset ",
    0x2286: r"\subseteq ",
    0x2287: r"\supseteq ",
    0x2295: r"\oplus ",
    0x2297: r"\otimes ",
    0x22A5: r"\perp ",
    0x22C5: r"\cdot ",
    0x22EF: r"\cdots ",
    0x22EE: r"\vdots ",
    0x22F1: r"\ddots ",
    0x25B3: r"\triangle ",
    0x25B5: r"\triangle ",
    0x27E8: r"\langle ",
    0x27E9: r"\rangle ",
    # MTCode PUA spaces & symbols
    0xEF00: "",
    0xEF01: r"\,",
    0xEF02: r"\,",
    0xEF03: r"\;",
    0xEF04: r"\quad ",
    0xEF05: r"\,",
    0xEF06: r"\,",
    0xEF07: r"\ ",
    0xEF08: r"\quad ",
    0xF000: r"\triangle ",
    0xF001: r"\square ",
}

# MTCode PUA Blackboard Bold (Euclid Math Two) & Calligraphic
# In MathType MTCode: 0xEE00..0xEE19 = calligraphic, 0xEE64..0xEE7D = blackboard bold A..Z (varies by font)
for _i in range(26):
    _ch = chr(ord("A") + _i)
    MTCODE_TO_TEX[0xF100 + _i] = rf"\mathbb{{{_ch}}}"


def _mtcode_to_tex(code: int, typeface: int = 0) -> str:
    if code in MTCODE_TO_TEX:
        return MTCODE_TO_TEX[code]
    # Standard printable ASCII
    if 0x20 <= code <= 0x7E:
        ch = chr(code)
        if ch == "{":
            return r"\{"
        if ch == "}":
            return r"\}"
        if ch == "%":
            return r"\%"
        if ch == "#":
            return r"\#"
        if ch == "&":
            return r"\&"
        if ch == "$":
            return r"\$"
        if ch == "\\":
            return r"\setminus "
        return ch
    # Valid Unicode (Vietnamese letters, math symbols, etc.)
    if 0x00A0 <= code < 0xE000:
        return chr(code)
    # Blackboard bold / PUA fallbacks seen in MTCode
    if 0xEF41 <= code <= 0xEF5A:
        return rf"\mathbb{{{chr(code - 0xEF41 + 65)}}}"
    if 0xEE00 <= code <= 0xEEFF:
        return ""
    return ""


# =============================================================================
# 3. MTEF v5 BINARY STREAM PARSER -> LATEX
# =============================================================================

# Record types (low 4 bits of record tag in MTEF v5; bit 7 = future, bits 4-6 = options? No: MTEF v5 record type is the full byte!)
REC_END = 0
REC_LINE = 1
REC_CHAR = 2
REC_TMPL = 3
REC_PILE = 4
REC_MATRIX = 5
REC_EMBELL = 6
REC_RULER = 7
REC_FONT_STYLE_DEF = 8
REC_SIZE = 9
REC_FULL = 10
REC_SUB = 11
REC_SUB2 = 12
REC_SYM = 13
REC_SUBSYM = 14
REC_COLOR = 15
REC_COLOR_DEF = 16
REC_FONT_DEF = 17
REC_EQN_PREFS = 18
REC_ENCODING_DEF = 19

# Option flags
OPT_NUDGE = 0x08
OPT_CHAR_EMBELL = 0x01
OPT_CHAR_FUNC_START = 0x02
OPT_CHAR_ENC_CHAR_8 = 0x04
OPT_CHAR_ENC_CHAR_16 = 0x10
OPT_CHAR_ENC_NO_MTCODE = 0x20

OPT_LINE_NULL = 0x01
OPT_LINE_LSPACE = 0x04
OPT_LP_RULER = 0x02

# Template selectors (Official MTEF v5 spec — verified against DSMT7)
TM_ANGLE = 0
TM_PAREN = 1
TM_BRACE = 2
TM_BRACK = 3
TM_BAR = 4
TM_DBAR = 5
TM_FLOOR = 6
TM_CEILING = 7
TM_LBLB = 8
TM_RBRB = 9
TM_ROOT = 10
TM_FRACT = 11
TM_UBAR = 12
TM_OBAR = 13
TM_ARROW = 14
TM_INTEG = 15
TM_SUM = 16
TM_PROD = 17
TM_COPROD = 18
TM_UNION = 19
TM_INTER = 20
TM_INTOP = 21
TM_SUMOP = 22
TM_LIM = 23
TM_HBRACE = 24
TM_HBRACK = 25
TM_LDIV = 26
TM_SUB = 27
TM_SUP = 28
TM_SUBSUP = 29
TM_DIRAC = 30
TM_VEC = 31
TM_TILDE = 32
TM_HAT = 33
TM_ARC = 34
TM_JSTATUS = 35
TM_STRIKE = 36
TM_BOX = 37
TM_RBLB = 38
TM_LBRP = 39
TM_LPRB = 40

# Fence variation flags (for TM_ANGLE..TM_LPRB)
TV_FENCE_L = 0x0001
TV_FENCE_R = 0x0002

# Embellishment types
EMB_1DOT = 2
EMB_2DOT = 3
EMB_3DOT = 4
EMB_1PRIME = 5
EMB_2PRIME = 6
EMB_BPRIME = 7
EMB_TILDE = 8
EMB_HAT = 9
EMB_NOT = 10
EMB_RARROW = 11
EMB_LARROW = 12
EMB_BARROW = 13
EMB_R1ARROW = 14
EMB_L1ARROW = 15
EMB_MBAR = 16
EMB_OBAR = 17
EMB_3PRIME = 18
EMB_FROWN = 19
EMB_SMILE = 20
EMB_X_BARS = 21
EMB_UP_BAR = 22
EMB_DOWN_BAR = 23
EMB_4DOT = 24
EMB_U_1DOT = 25
EMB_U_2DOT = 26
EMB_U_3DOT = 27
EMB_U_4DOT = 28
EMB_U_BAR = 29
EMB_U_TILDE = 30
EMB_U_FROWN = 31
EMB_U_SMILE = 32
EMB_U_RARROW = 33
EMB_U_LARROW = 34
EMB_U_BARROW = 35
EMB_U_R1ARROW = 36
EMB_U_L1ARROW = 37

KNOWN_FUNCTIONS = {
    "sin", "cos", "tan", "cot", "csc", "sec",
    "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh",
    "log", "ln", "lg", "exp", "lim", "max", "min", "det", "gcd", "arg",
}


class MTEFReader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        self.n = len(data)
        self.encodings: list[str] = ["MTCode", "Standard", "Symbol", "MT Extra"]
        self.fonts: dict[int, tuple[int, str]] = {}

    def eof(self) -> bool:
        return self.pos >= self.n

    def u8(self) -> int:
        if self.pos >= self.n:
            return 0
        v = self.data[self.pos]
        self.pos += 1
        return v

    def s8(self) -> int:
        if self.pos >= self.n:
            return 0
        v = struct.unpack_from("<b", self.data, self.pos)[0]
        self.pos += 1
        return v

    def u16(self) -> int:
        if self.pos + 2 > self.n:
            self.pos = self.n
            return 0
        v = struct.unpack_from("<H", self.data, self.pos)[0]
        self.pos += 2
        return v

    def s16(self) -> int:
        if self.pos + 2 > self.n:
            self.pos = self.n
            return 0
        v = struct.unpack_from("<h", self.data, self.pos)[0]
        self.pos += 2
        return v

    def read_cstr(self) -> str:
        start = self.pos
        while self.pos < self.n and self.data[self.pos] != 0:
            self.pos += 1
        raw = self.data[start : self.pos]
        if self.pos < self.n:
            self.pos += 1
        return raw.decode("latin1", errors="ignore")

    def read_sint(self) -> int:
        """MTEF signed integer (1 byte unless -128 -> followed by 2-byte signed)."""
        b = self.s8()
        if b == -128:
            return self.s16()
        return b

    def read_uint(self) -> int:
        """MTEF unsigned integer (1 byte unless 255 -> followed by 2-byte unsigned)."""
        b = self.u8()
        if b == 255:
            return self.u16()
        return b

    def skip_nudge(self) -> None:
        dx = self.u8()
        dy = self.u8()
        if dx == 128 and dy == 128:
            self.s16()
            self.s16()

    def skip_dimension_array(self) -> None:
        count = self.u8()
        # Each dimension is packed in nibbles terminated by 0xF (with count items total)
        # MTEF v5 spec: count dimensions, nibbles: 0x0..0x9 digits, 0xA '.', 0xB '-', 0xC..0xE units, 0xF end
        # Wait: in MTEF v5 eqn_prefs, units byte precedes each nibble-encoded number, ending on 0xF nibble!
        found = 0
        high_next = True
        cur_byte = 0
        while found < count and not self.eof():
            if high_next:
                cur_byte = self.u8()
                nib = (cur_byte >> 4) & 0x0F
                high_next = False
            else:
                nib = cur_byte & 0x0F
                high_next = True
            if nib == 0x0F:
                found += 1

    def skip_ruler(self) -> None:
        n_stops = self.u8()
        for _ in range(n_stops):
            self.u8()  # type
            self.u16()  # offset

    def parse(self) -> str:
        if self.n < 6:
            return ""
        ver = self.u8()
        if ver != 5:
            return ""
        _platform = self.u8()
        _product = self.u8()
        _prod_ver = self.u8()
        _prod_subver = self.u8()
        _app_key = self.read_cstr()
        _eqn_opts = self.u8()
        return self._clean_tex(self.read_object_list())

    def read_embell_list(self) -> list[int]:
        embells: list[int] = []
        while not self.eof():
            rec = self.u8()
            if rec == REC_END:
                break
            if rec == REC_EMBELL:
                opts = self.u8()
                if opts & OPT_NUDGE:
                    self.skip_nudge()
                emb_type = self.u8()
                embells.append(emb_type)
            else:
                # Unexpected record inside embell list — step back and stop
                self.pos -= 1
                break
        return embells

    def _apply_embell(self, base: str, embells: list[int]) -> str:
        out = base
        for e in embells:
            if e == EMB_1PRIME:
                out = f"{out}'"
            elif e == EMB_2PRIME:
                out = f"{out}''"
            elif e == EMB_3PRIME:
                out = f"{out}'''"
            elif e == EMB_RARROW or e == EMB_R1ARROW:
                out = rf"\overrightarrow{{{out}}}"
            elif e == EMB_LARROW or e == EMB_L1ARROW:
                out = rf"\overleftarrow{{{out}}}"
            elif e == EMB_BARROW:
                out = rf"\overleftrightarrow{{{out}}}"
            elif e == EMB_HAT:
                out = rf"\widehat{{{out}}}" if len(out) > 1 else rf"\hat{{{out}}}"
            elif e == EMB_TILDE:
                out = rf"\widetilde{{{out}}}" if len(out) > 1 else rf"\tilde{{{out}}}"
            elif e == EMB_OBAR:
                out = rf"\overline{{{out}}}"
            elif e == EMB_U_BAR:
                out = rf"\underline{{{out}}}"
            elif e == EMB_1DOT:
                out = rf"\dot{{{out}}}"
            elif e == EMB_2DOT:
                out = rf"\ddot{{{out}}}"
            elif e == EMB_NOT:
                out = rf"\not {out}"
            elif e == EMB_FROWN:
                out = rf"\overset{{\frown}}{{{out}}}"
        return out

    def _read_char_record(self) -> str:
        opts = self.u8()
        if opts & OPT_NUDGE:
            self.skip_nudge()
        typeface = self.read_sint()
        mtcode = 0
        if not (opts & OPT_CHAR_ENC_NO_MTCODE):
            mtcode = self.u16()
        if opts & OPT_CHAR_ENC_CHAR_8:
            enc8 = self.u8()
            if mtcode == 0:
                mtcode = enc8
        elif opts & OPT_CHAR_ENC_CHAR_16:
            enc16 = self.u16()
            if mtcode == 0:
                mtcode = enc16
        ch_tex = _mtcode_to_tex(mtcode, typeface)
        if opts & OPT_CHAR_EMBELL:
            embells = self.read_embell_list()
            ch_tex = self._apply_embell(ch_tex, embells)
        return ch_tex

    def _read_template_slots(self) -> tuple[list[str], list[str]]:
        slots: list[str] = []
        extra_chars: list[str] = []
        while not self.eof():
            rec = self.u8()
            if rec == REC_END:
                break
            if rec == REC_LINE:
                slots.append(self._read_line_body())
            elif rec == REC_PILE:
                slots.append(self._read_pile_body())
            elif rec == REC_MATRIX:
                slots.append(self._read_matrix_body())
            elif rec == REC_CHAR:
                ch = self._read_char_record()
                if ch:
                    extra_chars.append(ch)
            else:
                self._skip_or_read_misc(rec)
        return slots, extra_chars

    def _read_line_body(self) -> str:
        opts = self.u8()
        if opts & OPT_NUDGE:
            self.skip_nudge()
        if opts & OPT_LINE_LSPACE:
            self.u16()
        if opts & OPT_LP_RULER:
            # Ruler record follows immediately
            r_tag = self.u8()
            if r_tag == REC_RULER:
                self.skip_ruler()
            else:
                self.pos -= 1
        if opts & OPT_LINE_NULL:
            return ""
        return self.read_object_list()

    def _read_pile_body(self) -> str:
        opts = self.u8()
        if opts & OPT_NUDGE:
            self.skip_nudge()
        _halign = self.u8()
        _valign = self.u8()
        if opts & OPT_LP_RULER:
            r_tag = self.u8()
            if r_tag == REC_RULER:
                self.skip_ruler()
            else:
                self.pos -= 1
        lines: list[str] = []
        while not self.eof():
            rec = self.u8()
            if rec == REC_END:
                break
            if rec == REC_LINE:
                lines.append(self._read_line_body())
            else:
                self._skip_or_read_misc(rec)
        if not lines:
            return ""
        if len(lines) == 1:
            return lines[0]
        return r"\begin{aligned}" + r" \\ ".join(lines) + r"\end{aligned}"

    def _read_matrix_body(self) -> str:
        opts = self.u8()
        if opts & OPT_NUDGE:
            self.skip_nudge()
        _valign = self.u8()
        _h_just = self.u8()
        _v_just = self.u8()
        rows = self.u8()
        cols = self.u8()
        # Row partition line bytes: ceil((rows+1)/4) bytes; Col partition line bytes: ceil((cols+1)/4) bytes
        # MTEF v5 spec: row_parts has (rows+1) 2-bit entries packed 4 per byte
        row_part_bytes = (rows + 1 + 3) // 4
        col_part_bytes = (cols + 1 + 3) // 4
        self.pos += row_part_bytes + col_part_bytes
        cells: list[str] = []
        while not self.eof():
            rec = self.u8()
            if rec == REC_END:
                break
            if rec == REC_LINE:
                cells.append(self._read_line_body())
            elif rec == REC_PILE:
                cells.append(self._read_pile_body())
            else:
                self._skip_or_read_misc(rec)
        if rows <= 0 or cols <= 0:
            return " ".join(cells)
        grid_rows = []
        for r in range(rows):
            row_cells = [cells[r * cols + c] if r * cols + c < len(cells) else "" for c in range(cols)]
            grid_rows.append(" & ".join(row_cells))
        if cols == 1:
            return r"\begin{aligned}" + r" \\ ".join(grid_rows) + r"\end{aligned}"
        return r"\begin{matrix}" + r" \\ ".join(grid_rows) + r"\end{matrix}"

    def _skip_or_read_misc(self, rec: int) -> str:
        if rec == REC_ENCODING_DEF:
            enc_name = self.read_cstr()
            self.encodings.append(enc_name)
        elif rec == REC_FONT_DEF:
            enc_idx = self.u8()
            fname = self.read_cstr()
            self.fonts[len(self.fonts) + 1] = (enc_idx, fname)
        elif rec == REC_FONT_STYLE_DEF:
            self.u8()  # font_def_index
            self.u8()  # char_style
        elif rec == REC_EQN_PREFS:
            _opts = self.u8()
            self.skip_dimension_array()  # sizes
            self.skip_dimension_array()  # spaces
            # styles array: count byte, then for each style: font_def_index (if != 0, followed by char_style byte)
            n_styles = self.u8()
            for _ in range(n_styles):
                fidx = self.u8()
                if fidx != 0:
                    self.u8()
        elif rec == REC_SIZE:
            lsize = self.u8()
            if lsize == 101:
                self.s16()
            elif lsize == 100:
                self.u8()
                self.s16()
            else:
                self.s8()
        elif rec in (REC_FULL, REC_SUB, REC_SUB2, REC_SYM, REC_SUBSYM):
            pass
        elif rec == REC_COLOR:
            self.read_uint()
        elif rec == REC_COLOR_DEF:
            opts = self.u8()
            # MTEF v5: bit 0 = CMYK (4 u16), else RGB (3 u16); bit 1 = spot; bit 2 = name follows
            n_vals = 4 if (opts & 0x01) else 3
            for _ in range(n_vals):
                self.u16()
            if opts & 0x04:
                self.read_cstr()
        elif rec == REC_RULER:
            self.skip_ruler()
        elif rec >= 100:
            # Future record: skip gracefully (none expected in DSMT7)
            pass
        return ""

    def _format_template(self, sel: int, variation: int, slots: list[str], extra_chars: list[str] | None = None) -> str:
        s0 = slots[0] if len(slots) > 0 else ""
        s1 = slots[1] if len(slots) > 1 else ""
        s2 = slots[2] if len(slots) > 2 else ""
        echars = [c.strip() for c in (extra_chars or []) if c.strip() in ("(", ")", "[", "]", r"\{", r"\}", "|", r"\|", r"\langle", r"\rangle")]

        # Fences (TM_ANGLE .. TM_RBRB and half-open intervals TM_RBLB / TM_LBRP / TM_LPRB)
        fence_pairs = {
            TM_ANGLE: (r"\langle ", r"\rangle "),
            TM_PAREN: ("(", ")"),
            TM_BRACE: (r"\{", r"\}"),
            TM_BRACK: ("[", "]"),
            TM_BAR: ("|", "|"),
            TM_DBAR: (r"\|", r"\|"),
            TM_FLOOR: (r"\lfloor ", r"\rfloor "),
            TM_CEILING: (r"\lceil ", r"\rceil "),
            TM_LBLB: ("[", "["),
            TM_RBRB: ("]", "]"),
            TM_RBLB: ("]", "["),
            TM_LBRP: ("[", ")"),
            TM_LPRB: ("(", "]"),
        }
        if sel in fence_pairs:
            l_tok, r_tok = fence_pairs[sel]
            has_l = bool(variation & TV_FENCE_L) or (variation == 0)
            has_r = bool(variation & TV_FENCE_R) or (variation == 0)
            # If MTEF explicitly included both left & right fence CHAR records (e.g. half-open intervals [a;b) or (a;b]), trust them!
            if len(echars) == 2 and echars[0] in ("(", ")", "[", "]", r"\{", "|") and echars[1] in ("(", ")", "[", "]", r"\}", "|"):
                l_tok, r_tok = echars[0], echars[1]
                has_l = has_r = True
            # System of equations: left brace only + aligned/pile body
            if sel == TM_BRACE and has_l and not has_r:
                return rf"\left\{{{s0}\right."
            left_str = rf"\left{l_tok}" if has_l else r"\left."
            right_str = rf"\right{r_tok}" if has_r else r"\right."
            # Keep simple single-line parens/brackets clean without unnecessary \left/\right unless tall
            is_tall = any(k in s0 for k in (r"\dfrac", r"\frac", r"\begin{", r"\sum", r"\int", r"\sqrt"))
            if not is_tall and has_l and has_r and l_tok in ("(", "[", "]", "|", r"\{") and r_tok in (")", "]", "[", "|", r"\}"):
                return f"{l_tok}{s0}{r_tok}"
            return f"{left_str}{s0}{right_str}"

        if sel == TM_FRACT:
            # variation bit 0 = small/inline, bit 1 = slash
            if variation & 0x02:
                return f"{s0}/{s1}"
            return rf"\dfrac{{{s0}}}{{{s1}}}"

        if sel == TM_ROOT:
            # s0 = radicand, s1 = index (optional)
            if s1.strip():
                return rf"\sqrt[{s1}]{{{s0}}}"
            return rf"\sqrt{{{s0}}}"

        if sel == TM_SUB:
            val = s0.strip() or s1.strip()
            return f"_{{{val}}}" if val else ""
        if sel == TM_SUP:
            # In MTEF v5, TM_SUP stores [sub_slot(null), sup_slot]
            val = s1.strip() or s0.strip()
            return f"^{{{val}}}" if val else ""
        if sel == TM_SUBSUP:
            # s0 = sub, s1 = sup
            out = ""
            if s0.strip():
                out += f"_{{{s0}}}"
            if s1.strip():
                out += f"^{{{s1}}}"
            return out

        if sel == TM_VEC:
            # Variation 0 = right arrow, 1 = left arrow, 2 = right arrow (DSMT7), 3 = double arrow
            if variation == 1:
                return rf"\overleftarrow{{{s0}}}"
            if variation == 3:
                return rf"\overleftrightarrow{{{s0}}}"
            return rf"\overrightarrow{{{s0.strip()}}}"

        if sel == TM_TILDE:
            return rf"\widetilde{{{s0}}}"
        if sel == TM_HAT:
            return rf"\widehat{{{s0}}}"
        if sel == TM_ARC:
            return rf"\overset{{\frown}}{{{s0}}}"
        if sel == TM_OBAR:
            return rf"\overline{{{s0}}}"
        if sel == TM_UBAR:
            return rf"\underline{{{s0}}}"
        if sel == TM_HBRACE:
            # variation 0 = overbrace, 1 = underbrace
            if variation & 0x01:
                return rf"\underbrace{{{s0}}}_{{{s1}}}" if s1.strip() else rf"\underbrace{{{s0}}}"
            return rf"\overbrace{{{s0}}}^{{{s1}}}" if s1.strip() else rf"\overbrace{{{s0}}}"
        if sel == TM_HBRACK:
            return s0
        if sel == TM_ARROW:
            top = s0.strip()
            bot = s1.strip()
            if top and bot:
                return rf"\xrightarrow[{bot}]{{{top}}}"
            if top:
                return rf"\xrightarrow{{{top}}}"
            return r"\to "

        # Big operators: TM_INTEG..TM_SUMOP
        big_ops = {
            TM_INTEG: r"\int",
            TM_SUM: r"\sum",
            TM_PROD: r"\prod",
            TM_COPROD: r"\coprod",
            TM_UNION: r"\bigcup",
            TM_INTER: r"\bigcap",
        }
        if sel in big_ops:
            op = big_ops[sel]
            # Slots: [main_integrand, lower_limit, upper_limit] (order in MTEF: s0=main, s1=lower, s2=upper)
            res = op
            if s1.strip():
                res += f"_{{{s1}}}"
            if s2.strip():
                res += f"^{{{s2}}}"
            if s0.strip():
                res += f" {s0}"
            return res

        if sel == TM_LIM:
            # s0 = main (e.g. lim), s1 = lower limit, s2 = upper
            res = s0
            if s1.strip():
                res += f"_{{{s1}}}"
            if s2.strip():
                res += f"^{{{s2}}}"
            return res

        if sel == TM_DIRAC:
            return rf"\langle {s0} \mid {s1} \rangle"

        if sel == TM_BOX:
            return rf"\boxed{{{s0}}}"
        if sel == TM_STRIKE:
            return s0

        return "".join(slots)

    def read_object_list(self) -> str:
        parts: list[str] = []
        while not self.eof():
            rec = self.u8()
            if rec == REC_END:
                break
            elif rec == REC_LINE:
                parts.append(self._read_line_body())
            elif rec == REC_PILE:
                parts.append(self._read_pile_body())
            elif rec == REC_MATRIX:
                parts.append(self._read_matrix_body())
            elif rec == REC_CHAR:
                parts.append(self._read_char_record())
            elif rec == REC_TMPL:
                opts = self.u8()
                if opts & OPT_NUDGE:
                    self.skip_nudge()
                sel = self.u8()
                var_b = self.u8()
                if var_b & 0x80:
                    var_hi = self.u8()
                    variation = (var_b & 0x7F) | (var_hi << 8)
                else:
                    variation = var_b
                _tmpl_opts = self.u8()
                slots, extra_chars = self._read_template_slots()
                # Attach TM_SUB/TM_SUP/TM_SUBSUP cleanly to the previous token if present
                t_tex = self._format_template(sel, variation, slots, extra_chars)
                if sel in (TM_SUB, TM_SUP, TM_SUBSUP) and parts:
                    prev = parts[-1]
                    # Avoid double superscripts/subscripts crashing KaTeX
                    if (prev.endswith("}") or len(prev) == 1) and not prev.endswith(" "):
                        parts[-1] = prev + t_tex
                    else:
                        parts.append(t_tex)
                else:
                    parts.append(t_tex)
            else:
                self._skip_or_read_misc(rec)
        return "".join(parts)

    def _clean_tex(self, raw: str) -> str:
        s = raw.strip()
        if not s:
            return ""
        # Promote bare function names like sin, cos, tan, cot, log, ln, lim -> \sin, \cos, ...
        import re
        s = re.sub(
            r"(?<!\\)\b(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|cot|log|ln|lim)(?![A-Za-z])",
            r"\\\1 ",
            s,
        )
        # Prevent double superscripts like 45^{^\circ} and normalize degree symbols (85^{o}, 85^o, 85°) -> 85^\circ
        s = re.sub(r"\^\{\s*\^\\circ\s*\}", r"^\\circ", s)
        s = re.sub(r"(\d)\s*\^\s*\{\s*[oO°]\s*\}", r"\1^\\circ", s)
        s = re.sub(r"(\d)\s*\^\s*[oO°](?![A-Za-z])", r"\1^\\circ", s)
        s = re.sub(r"(\d)\s*°", r"\1^\\circ", s)
        # Strip explicit spacing commands around coordinate semicolons (e.g. 2\,\,;\,\,1 -> 2;1)
        s = re.sub(r"(?:\\[,:! ]|\s)+(?=(?<!\\);)", "", s)
        s = re.sub(r"(?<!\\);(?:\\[,:! ]|\s)+", ";", s)
        # Clean redundant spaces around punctuation/operators
        s = re.sub(r"\s{2,}", " ", s)
        return s.strip()


def mtef_bytes_to_latex(mtef_bytes: bytes | None) -> str:
    if not mtef_bytes:
        return ""
    try:
        return MTEFReader(mtef_bytes).parse()
    except Exception:
        return ""


def ole_bytes_to_latex(ole_bytes: bytes) -> str:
    return mtef_bytes_to_latex(extract_mtef_from_ole(ole_bytes))


def wmf_bytes_to_latex(wmf_bytes: bytes) -> str:
    return mtef_bytes_to_latex(extract_mtef_from_wmf(wmf_bytes))
