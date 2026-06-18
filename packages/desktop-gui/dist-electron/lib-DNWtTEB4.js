import { a as e, i as t, n, r, t as i } from "./main.cjs";
//#region node_modules/sharp/lib/is.js
var a = /* @__PURE__ */ i(((e, t) => {
	var n = (e) => e != null;
	t.exports = {
		defined: n,
		object: (e) => typeof e == "object",
		plainObject: (e) => Object.prototype.toString.call(e) === "[object Object]",
		fn: (e) => typeof e == "function",
		bool: (e) => typeof e == "boolean",
		buffer: (e) => e instanceof Buffer,
		typedArray: (e) => {
			if (n(e)) switch (e.constructor) {
				case Uint8Array:
				case Uint8ClampedArray:
				case Int8Array:
				case Uint16Array:
				case Int16Array:
				case Uint32Array:
				case Int32Array:
				case Float32Array:
				case Float64Array: return !0;
			}
			return !1;
		},
		arrayBuffer: (e) => e instanceof ArrayBuffer,
		string: (e) => typeof e == "string" && e.length > 0,
		number: (e) => typeof e == "number" && !Number.isNaN(e),
		integer: (e) => Number.isInteger(e),
		inRange: (e, t, n) => e >= t && e <= n,
		inArray: (e, t) => t.includes(e),
		invalidParameterError: (e, t, n) => /* @__PURE__ */ Error(`Expected ${t} for ${e} but received ${n} of type ${typeof n}`),
		nativeError: (e, t) => (t.message = e.message, t)
	};
})), o = /* @__PURE__ */ i(((e, t) => {
	var n = () => process.platform === "linux", r = null;
	t.exports = {
		isLinux: n,
		getReport: () => {
			if (!r)
 /* istanbul ignore next */
			if (n() && process.report) {
				let e = process.report.excludeNetwork;
				process.report.excludeNetwork = !0, r = process.report.getReport(), process.report.excludeNetwork = e;
			} else r = {};
			return r;
		}
	};
})), s = /* @__PURE__ */ i(((e, n) => {
	var r = t("fs"), i = "/usr/bin/ldd", a = "/proc/self/exe", o = 2048;
	n.exports = {
		LDD_PATH: i,
		SELF_PATH: a,
		readFileSync: (e) => {
			let t = r.openSync(e, "r"), n = Buffer.alloc(o), i = r.readSync(t, n, 0, o, 0);
			return r.close(t, () => {}), n.subarray(0, i);
		},
		readFile: (e) => new Promise((t, n) => {
			r.open(e, "r", (e, i) => {
				if (e) n(e);
				else {
					let e = Buffer.alloc(o);
					r.read(i, e, 0, o, 0, (n, a) => {
						t(e.subarray(0, a)), r.close(i, () => {});
					});
				}
			});
		})
	};
})), c = /* @__PURE__ */ i(((e, t) => {
	t.exports = { interpreterPath: (e) => {
		if (e.length < 64 || e.readUInt32BE(0) !== 2135247942 || e.readUInt8(4) !== 2 || e.readUInt8(5) !== 1) return null;
		let t = e.readUInt32LE(32), n = e.readUInt16LE(54), r = e.readUInt16LE(56);
		for (let i = 0; i < r; i++) {
			let r = t + i * n;
			if (e.readUInt32LE(r) === 3) {
				let t = e.readUInt32LE(r + 8), n = e.readUInt32LE(r + 32);
				return e.subarray(t, t + n).toString().replace(/\0.*$/g, "");
			}
		}
		return null;
	} };
})), l = /* @__PURE__ */ i(((e, n) => {
	var r = t("child_process"), { isLinux: i, getReport: a } = o(), { LDD_PATH: l, SELF_PATH: u, readFile: d, readFileSync: f } = s(), { interpreterPath: p } = c(), m, h, g, _ = "getconf GNU_LIBC_VERSION 2>&1 || true; ldd --version 2>&1 || true", v = "", y = () => v || new Promise((e) => {
		r.exec(_, (t, n) => {
			v = t ? " " : n, e(v);
		});
	}), b = () => {
		if (!v) try {
			v = r.execSync(_, { encoding: "utf8" });
		} catch {
			v = " ";
		}
		return v;
	}, x = "glibc", S = /LIBC[a-z0-9 \-).]*?(\d+\.\d+)/i, C = "musl", w = (e) => e.includes("libc.musl-") || e.includes("ld-musl-"), T = () => {
		let e = a();
		return e.header && e.header.glibcVersionRuntime ? x : Array.isArray(e.sharedObjects) && e.sharedObjects.some(w) ? C : null;
	}, E = (e) => {
		let [t, n] = e.split(/[\r\n]+/);
		return t && t.includes(x) ? x : n && n.includes(C) ? C : null;
	}, D = (e) => {
		if (e) {
			if (e.includes("/ld-musl-")) return C;
			if (e.includes("/ld-linux-")) return x;
		}
		return null;
	}, O = (e) => (e = e.toString(), e.includes("musl") ? C : e.includes("GNU C Library") ? x : null), k = async () => {
		if (h !== void 0) return h;
		h = null;
		try {
			h = O(await d(l));
		} catch {}
		return h;
	}, A = () => {
		if (h !== void 0) return h;
		h = null;
		try {
			h = O(f(l));
		} catch {}
		return h;
	}, j = async () => {
		if (m !== void 0) return m;
		m = null;
		try {
			m = D(p(await d(u)));
		} catch {}
		return m;
	}, M = () => {
		if (m !== void 0) return m;
		m = null;
		try {
			m = D(p(f(u)));
		} catch {}
		return m;
	}, N = async () => {
		let e = null;
		return i() && (e = await j(), e || (e = await k(), e ||= T(), e ||= E(await y()))), e;
	}, P = () => {
		let e = null;
		return i() && (e = M(), e || (e = A(), e ||= T(), e ||= E(b()))), e;
	}, F = async () => i() && await N() !== x, I = () => i() && P() !== x, L = async () => {
		if (g !== void 0) return g;
		g = null;
		try {
			let e = (await d(l)).match(S);
			e && (g = e[1]);
		} catch {}
		return g;
	}, R = () => {
		if (g !== void 0) return g;
		g = null;
		try {
			let e = f(l).match(S);
			e && (g = e[1]);
		} catch {}
		return g;
	}, z = () => {
		let e = a();
		return e.header && e.header.glibcVersionRuntime ? e.header.glibcVersionRuntime : null;
	}, B = (e) => e.trim().split(/\s+/)[1], V = (e) => {
		let [t, n, r] = e.split(/[\r\n]+/);
		return t && t.includes(x) ? B(t) : n && r && n.includes(C) ? B(r) : null;
	};
	n.exports = {
		GLIBC: x,
		MUSL: C,
		family: N,
		familySync: P,
		isNonGlibcLinux: F,
		isNonGlibcLinuxSync: I,
		version: async () => {
			let e = null;
			return i() && (e = await L(), e ||= z(), e ||= V(await y())), e;
		},
		versionSync: () => {
			let e = null;
			return i() && (e = R(), e ||= z(), e ||= V(b())), e;
		}
	};
})), u = /* @__PURE__ */ i(((e, t) => {
	t.exports = typeof process == "object" && process.env && process.env.NODE_DEBUG && /\bsemver\b/i.test(process.env.NODE_DEBUG) ? (...e) => console.error("SEMVER", ...e) : () => {};
})), d = /* @__PURE__ */ i(((e, t) => {
	var n = "2.0.0", r = 256;
	t.exports = {
		MAX_LENGTH: r,
		MAX_SAFE_COMPONENT_LENGTH: 16,
		MAX_SAFE_BUILD_LENGTH: r - 6,
		MAX_SAFE_INTEGER: 2 ** 53 - 1 || 9007199254740991,
		RELEASE_TYPES: [
			"major",
			"premajor",
			"minor",
			"preminor",
			"patch",
			"prepatch",
			"prerelease"
		],
		SEMVER_SPEC_VERSION: n,
		FLAG_INCLUDE_PRERELEASE: 1,
		FLAG_LOOSE: 2
	};
})), f = /* @__PURE__ */ i(((e, t) => {
	var { MAX_SAFE_COMPONENT_LENGTH: n, MAX_SAFE_BUILD_LENGTH: r, MAX_LENGTH: i } = d(), a = u();
	e = t.exports = {};
	var o = e.re = [], s = e.safeRe = [], c = e.src = [], l = e.safeSrc = [], f = e.t = {}, p = 0, m = "[a-zA-Z0-9-]", h = [
		["\\s", 1],
		["\\d", i],
		[m, r]
	], g = (e) => {
		for (let [t, n] of h) e = e.split(`${t}*`).join(`${t}{0,${n}}`).split(`${t}+`).join(`${t}{1,${n}}`);
		return e;
	}, _ = (e, t, n) => {
		let r = g(t), i = p++;
		a(e, i, t), f[e] = i, c[i] = t, l[i] = r, o[i] = new RegExp(t, n ? "g" : void 0), s[i] = new RegExp(r, n ? "g" : void 0);
	};
	_("NUMERICIDENTIFIER", "0|[1-9]\\d*"), _("NUMERICIDENTIFIERLOOSE", "\\d+"), _("NONNUMERICIDENTIFIER", `\\d*[a-zA-Z-]${m}*`), _("MAINVERSION", `(${c[f.NUMERICIDENTIFIER]})\\.(${c[f.NUMERICIDENTIFIER]})\\.(${c[f.NUMERICIDENTIFIER]})`), _("MAINVERSIONLOOSE", `(${c[f.NUMERICIDENTIFIERLOOSE]})\\.(${c[f.NUMERICIDENTIFIERLOOSE]})\\.(${c[f.NUMERICIDENTIFIERLOOSE]})`), _("PRERELEASEIDENTIFIER", `(?:${c[f.NONNUMERICIDENTIFIER]}|${c[f.NUMERICIDENTIFIER]})`), _("PRERELEASEIDENTIFIERLOOSE", `(?:${c[f.NONNUMERICIDENTIFIER]}|${c[f.NUMERICIDENTIFIERLOOSE]})`), _("PRERELEASE", `(?:-(${c[f.PRERELEASEIDENTIFIER]}(?:\\.${c[f.PRERELEASEIDENTIFIER]})*))`), _("PRERELEASELOOSE", `(?:-?(${c[f.PRERELEASEIDENTIFIERLOOSE]}(?:\\.${c[f.PRERELEASEIDENTIFIERLOOSE]})*))`), _("BUILDIDENTIFIER", `${m}+`), _("BUILD", `(?:\\+(${c[f.BUILDIDENTIFIER]}(?:\\.${c[f.BUILDIDENTIFIER]})*))`), _("FULLPLAIN", `v?${c[f.MAINVERSION]}${c[f.PRERELEASE]}?${c[f.BUILD]}?`), _("FULL", `^${c[f.FULLPLAIN]}$`), _("LOOSEPLAIN", `[v=\\s]*${c[f.MAINVERSIONLOOSE]}${c[f.PRERELEASELOOSE]}?${c[f.BUILD]}?`), _("LOOSE", `^${c[f.LOOSEPLAIN]}$`), _("GTLT", "((?:<|>)?=?)"), _("XRANGEIDENTIFIERLOOSE", `${c[f.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`), _("XRANGEIDENTIFIER", `${c[f.NUMERICIDENTIFIER]}|x|X|\\*`), _("XRANGEPLAIN", `[v=\\s]*(${c[f.XRANGEIDENTIFIER]})(?:\\.(${c[f.XRANGEIDENTIFIER]})(?:\\.(${c[f.XRANGEIDENTIFIER]})(?:${c[f.PRERELEASE]})?${c[f.BUILD]}?)?)?`), _("XRANGEPLAINLOOSE", `[v=\\s]*(${c[f.XRANGEIDENTIFIERLOOSE]})(?:\\.(${c[f.XRANGEIDENTIFIERLOOSE]})(?:\\.(${c[f.XRANGEIDENTIFIERLOOSE]})(?:${c[f.PRERELEASELOOSE]})?${c[f.BUILD]}?)?)?`), _("XRANGE", `^${c[f.GTLT]}\\s*${c[f.XRANGEPLAIN]}$`), _("XRANGELOOSE", `^${c[f.GTLT]}\\s*${c[f.XRANGEPLAINLOOSE]}$`), _("COERCEPLAIN", `(^|[^\\d])(\\d{1,${n}})(?:\\.(\\d{1,${n}}))?(?:\\.(\\d{1,${n}}))?`), _("COERCE", `${c[f.COERCEPLAIN]}(?:$|[^\\d])`), _("COERCEFULL", c[f.COERCEPLAIN] + `(?:${c[f.PRERELEASE]})?(?:${c[f.BUILD]})?(?:$|[^\\d])`), _("COERCERTL", c[f.COERCE], !0), _("COERCERTLFULL", c[f.COERCEFULL], !0), _("LONETILDE", "(?:~>?)"), _("TILDETRIM", `(\\s*)${c[f.LONETILDE]}\\s+`, !0), e.tildeTrimReplace = "$1~", _("TILDE", `^${c[f.LONETILDE]}${c[f.XRANGEPLAIN]}$`), _("TILDELOOSE", `^${c[f.LONETILDE]}${c[f.XRANGEPLAINLOOSE]}$`), _("LONECARET", "(?:\\^)"), _("CARETTRIM", `(\\s*)${c[f.LONECARET]}\\s+`, !0), e.caretTrimReplace = "$1^", _("CARET", `^${c[f.LONECARET]}${c[f.XRANGEPLAIN]}$`), _("CARETLOOSE", `^${c[f.LONECARET]}${c[f.XRANGEPLAINLOOSE]}$`), _("COMPARATORLOOSE", `^${c[f.GTLT]}\\s*(${c[f.LOOSEPLAIN]})$|^$`), _("COMPARATOR", `^${c[f.GTLT]}\\s*(${c[f.FULLPLAIN]})$|^$`), _("COMPARATORTRIM", `(\\s*)${c[f.GTLT]}\\s*(${c[f.LOOSEPLAIN]}|${c[f.XRANGEPLAIN]})`, !0), e.comparatorTrimReplace = "$1$2$3", _("HYPHENRANGE", `^\\s*(${c[f.XRANGEPLAIN]})\\s+-\\s+(${c[f.XRANGEPLAIN]})\\s*$`), _("HYPHENRANGELOOSE", `^\\s*(${c[f.XRANGEPLAINLOOSE]})\\s+-\\s+(${c[f.XRANGEPLAINLOOSE]})\\s*$`), _("STAR", "(<|>)?=?\\s*\\*"), _("GTE0", "^\\s*>=\\s*0\\.0\\.0\\s*$"), _("GTE0PRE", "^\\s*>=\\s*0\\.0\\.0-0\\s*$");
})), p = /* @__PURE__ */ i(((e, t) => {
	var n = Object.freeze({ loose: !0 }), r = Object.freeze({});
	t.exports = (e) => e ? typeof e == "object" ? e : n : r;
})), m = /* @__PURE__ */ i(((e, t) => {
	var n = /^[0-9]+$/, r = (e, t) => {
		if (typeof e == "number" && typeof t == "number") return e === t ? 0 : e < t ? -1 : 1;
		let r = n.test(e), i = n.test(t);
		return r && i && (e = +e, t = +t), e === t ? 0 : r && !i ? -1 : i && !r ? 1 : e < t ? -1 : 1;
	};
	t.exports = {
		compareIdentifiers: r,
		rcompareIdentifiers: (e, t) => r(t, e)
	};
})), h = /* @__PURE__ */ i(((e, t) => {
	var n = u(), { MAX_LENGTH: r, MAX_SAFE_INTEGER: i } = d(), { safeRe: a, t: o } = f(), s = p(), { compareIdentifiers: c } = m(), l = (e, t) => {
		let n = t.split(".");
		if (n.length > e.length) return !1;
		for (let t = 0; t < n.length; t++) if (c(e[t], n[t]) !== 0) return !1;
		return !0;
	};
	t.exports = class e {
		constructor(t, c) {
			if (c = s(c), t instanceof e) {
				if (t.loose === !!c.loose && t.includePrerelease === !!c.includePrerelease) return t;
				t = t.version;
			} else if (typeof t != "string") throw TypeError(`Invalid version. Must be a string. Got type "${typeof t}".`);
			if (t.length > r) throw TypeError(`version is longer than ${r} characters`);
			n("SemVer", t, c), this.options = c, this.loose = !!c.loose, this.includePrerelease = !!c.includePrerelease;
			let l = t.trim().match(c.loose ? a[o.LOOSE] : a[o.FULL]);
			if (!l) throw TypeError(`Invalid Version: ${t}`);
			if (this.raw = t, this.major = +l[1], this.minor = +l[2], this.patch = +l[3], this.major > i || this.major < 0) throw TypeError("Invalid major version");
			if (this.minor > i || this.minor < 0) throw TypeError("Invalid minor version");
			if (this.patch > i || this.patch < 0) throw TypeError("Invalid patch version");
			l[4] ? this.prerelease = l[4].split(".").map((e) => {
				if (/^[0-9]+$/.test(e)) {
					let t = +e;
					if (t >= 0 && t < i) return t;
				}
				return e;
			}) : this.prerelease = [], this.build = l[5] ? l[5].split(".") : [], this.format();
		}
		format() {
			return this.version = `${this.major}.${this.minor}.${this.patch}`, this.prerelease.length && (this.version += `-${this.prerelease.join(".")}`), this.version;
		}
		toString() {
			return this.version;
		}
		compare(t) {
			if (n("SemVer.compare", this.version, this.options, t), !(t instanceof e)) {
				if (typeof t == "string" && t === this.version) return 0;
				t = new e(t, this.options);
			}
			return t.version === this.version ? 0 : this.compareMain(t) || this.comparePre(t);
		}
		compareMain(t) {
			return t instanceof e || (t = new e(t, this.options)), this.major < t.major ? -1 : this.major > t.major ? 1 : this.minor < t.minor ? -1 : this.minor > t.minor ? 1 : this.patch < t.patch ? -1 : +(this.patch > t.patch);
		}
		comparePre(t) {
			if (t instanceof e || (t = new e(t, this.options)), this.prerelease.length && !t.prerelease.length) return -1;
			if (!this.prerelease.length && t.prerelease.length) return 1;
			if (!this.prerelease.length && !t.prerelease.length) return 0;
			let r = 0;
			do {
				let e = this.prerelease[r], i = t.prerelease[r];
				if (n("prerelease compare", r, e, i), e === void 0 && i === void 0) return 0;
				if (i === void 0) return 1;
				if (e === void 0) return -1;
				if (e === i) continue;
				return c(e, i);
			} while (++r);
		}
		compareBuild(t) {
			t instanceof e || (t = new e(t, this.options));
			let r = 0;
			do {
				let e = this.build[r], i = t.build[r];
				if (n("build compare", r, e, i), e === void 0 && i === void 0) return 0;
				if (i === void 0) return 1;
				if (e === void 0) return -1;
				if (e === i) continue;
				return c(e, i);
			} while (++r);
		}
		inc(e, t, n) {
			if (e.startsWith("pre")) {
				if (!t && n === !1) throw Error("invalid increment argument: identifier is empty");
				if (t) {
					let e = `-${t}`.match(this.options.loose ? a[o.PRERELEASELOOSE] : a[o.PRERELEASE]);
					if (!e || e[1] !== t) throw Error(`invalid identifier: ${t}`);
				}
			}
			switch (e) {
				case "premajor":
					this.prerelease.length = 0, this.patch = 0, this.minor = 0, this.major++, this.inc("pre", t, n);
					break;
				case "preminor":
					this.prerelease.length = 0, this.patch = 0, this.minor++, this.inc("pre", t, n);
					break;
				case "prepatch":
					this.prerelease.length = 0, this.inc("patch", t, n), this.inc("pre", t, n);
					break;
				case "prerelease":
					this.prerelease.length === 0 && this.inc("patch", t, n), this.inc("pre", t, n);
					break;
				case "release":
					if (this.prerelease.length === 0) throw Error(`version ${this.raw} is not a prerelease`);
					this.prerelease.length = 0;
					break;
				case "major":
					(this.minor !== 0 || this.patch !== 0 || this.prerelease.length === 0) && this.major++, this.minor = 0, this.patch = 0, this.prerelease = [];
					break;
				case "minor":
					(this.patch !== 0 || this.prerelease.length === 0) && this.minor++, this.patch = 0, this.prerelease = [];
					break;
				case "patch":
					this.prerelease.length === 0 && this.patch++, this.prerelease = [];
					break;
				case "pre": {
					let e = +!!Number(n);
					if (this.prerelease.length === 0) this.prerelease = [e];
					else {
						let r = this.prerelease.length;
						for (; --r >= 0;) typeof this.prerelease[r] == "number" && (this.prerelease[r]++, r = -2);
						if (r === -1) {
							if (t === this.prerelease.join(".") && n === !1) throw Error("invalid increment argument: identifier already exists");
							this.prerelease.push(e);
						}
					}
					if (t) {
						let r = [t, e];
						if (n === !1 && (r = [t]), l(this.prerelease, t)) {
							let e = this.prerelease[t.split(".").length];
							isNaN(e) && (this.prerelease = r);
						} else this.prerelease = r;
					}
					break;
				}
				default: throw Error(`invalid increment argument: ${e}`);
			}
			return this.raw = this.format(), this.build.length && (this.raw += `+${this.build.join(".")}`), this;
		}
	};
})), g = /* @__PURE__ */ i(((e, t) => {
	var n = h();
	t.exports = (e, t, r = !1) => {
		if (e instanceof n) return e;
		try {
			return new n(e, t);
		} catch (e) {
			if (!r) return null;
			throw e;
		}
	};
})), _ = /* @__PURE__ */ i(((e, t) => {
	var n = h(), r = g(), { safeRe: i, t: a } = f();
	t.exports = (e, t) => {
		if (e instanceof n) return e;
		if (typeof e == "number" && (e = String(e)), typeof e != "string") return null;
		t ||= {};
		let o = null;
		if (!t.rtl) o = e.match(t.includePrerelease ? i[a.COERCEFULL] : i[a.COERCE]);
		else {
			let n = t.includePrerelease ? i[a.COERCERTLFULL] : i[a.COERCERTL], r;
			for (; (r = n.exec(e)) && (!o || o.index + o[0].length !== e.length);) (!o || r.index + r[0].length !== o.index + o[0].length) && (o = r), n.lastIndex = r.index + r[1].length + r[2].length;
			n.lastIndex = -1;
		}
		if (o === null) return null;
		let s = o[2];
		return r(`${s}.${o[3] || "0"}.${o[4] || "0"}${t.includePrerelease && o[5] ? `-${o[5]}` : ""}${t.includePrerelease && o[6] ? `+${o[6]}` : ""}`, t);
	};
})), v = /* @__PURE__ */ i(((e, t) => {
	var n = h();
	t.exports = (e, t, r) => new n(e, r).compare(new n(t, r));
})), y = /* @__PURE__ */ i(((e, t) => {
	var n = v();
	t.exports = (e, t, r) => n(e, t, r) >= 0;
})), b = /* @__PURE__ */ i(((e, t) => {
	t.exports = class {
		constructor() {
			this.max = 1e3, this.map = /* @__PURE__ */ new Map();
		}
		get(e) {
			let t = this.map.get(e);
			if (t !== void 0) return this.map.delete(e), this.map.set(e, t), t;
		}
		delete(e) {
			return this.map.delete(e);
		}
		set(e, t) {
			if (!this.delete(e) && t !== void 0) {
				if (this.map.size >= this.max) {
					let e = this.map.keys().next().value;
					this.delete(e);
				}
				this.map.set(e, t);
			}
			return this;
		}
	};
})), x = /* @__PURE__ */ i(((e, t) => {
	var n = v();
	t.exports = (e, t, r) => n(e, t, r) === 0;
})), S = /* @__PURE__ */ i(((e, t) => {
	var n = v();
	t.exports = (e, t, r) => n(e, t, r) !== 0;
})), C = /* @__PURE__ */ i(((e, t) => {
	var n = v();
	t.exports = (e, t, r) => n(e, t, r) > 0;
})), w = /* @__PURE__ */ i(((e, t) => {
	var n = v();
	t.exports = (e, t, r) => n(e, t, r) < 0;
})), T = /* @__PURE__ */ i(((e, t) => {
	var n = v();
	t.exports = (e, t, r) => n(e, t, r) <= 0;
})), E = /* @__PURE__ */ i(((e, t) => {
	var n = x(), r = S(), i = C(), a = y(), o = w(), s = T();
	t.exports = (e, t, c, l) => {
		switch (t) {
			case "===": return typeof e == "object" && (e = e.version), typeof c == "object" && (c = c.version), e === c;
			case "!==": return typeof e == "object" && (e = e.version), typeof c == "object" && (c = c.version), e !== c;
			case "":
			case "=":
			case "==": return n(e, c, l);
			case "!=": return r(e, c, l);
			case ">": return i(e, c, l);
			case ">=": return a(e, c, l);
			case "<": return o(e, c, l);
			case "<=": return s(e, c, l);
			default: throw TypeError(`Invalid operator: ${t}`);
		}
	};
})), D = /* @__PURE__ */ i(((e, t) => {
	var n = Symbol("SemVer ANY");
	t.exports = class e {
		static get ANY() {
			return n;
		}
		constructor(t, i) {
			if (i = r(i), t instanceof e) {
				if (t.loose === !!i.loose) return t;
				t = t.value;
			}
			t = t.trim().split(/\s+/).join(" "), s("comparator", t, i), this.options = i, this.loose = !!i.loose, this.parse(t), this.semver === n ? this.value = "" : this.value = this.operator + this.semver.version, s("comp", this);
		}
		parse(e) {
			let t = this.options.loose ? i[a.COMPARATORLOOSE] : i[a.COMPARATOR], r = e.match(t);
			if (!r) throw TypeError(`Invalid comparator: ${e}`);
			this.operator = r[1] === void 0 ? "" : r[1], this.operator === "=" && (this.operator = ""), r[2] ? this.semver = new c(r[2], this.options.loose) : this.semver = n;
		}
		toString() {
			return this.value;
		}
		test(e) {
			if (s("Comparator.test", e, this.options.loose), this.semver === n || e === n) return !0;
			if (typeof e == "string") try {
				e = new c(e, this.options);
			} catch {
				return !1;
			}
			return o(e, this.operator, this.semver, this.options);
		}
		intersects(t, n) {
			if (!(t instanceof e)) throw TypeError("a Comparator is required");
			return this.operator === "" ? this.value === "" ? !0 : new l(t.value, n).test(this.value) : t.operator === "" ? t.value === "" ? !0 : new l(this.value, n).test(t.semver) : (n = r(n), n.includePrerelease && (this.value === "<0.0.0-0" || t.value === "<0.0.0-0") || !n.includePrerelease && (this.value.startsWith("<0.0.0") || t.value.startsWith("<0.0.0")) ? !1 : !!(this.operator.startsWith(">") && t.operator.startsWith(">") || this.operator.startsWith("<") && t.operator.startsWith("<") || this.semver.version === t.semver.version && this.operator.includes("=") && t.operator.includes("=") || o(this.semver, "<", t.semver, n) && this.operator.startsWith(">") && t.operator.startsWith("<") || o(this.semver, ">", t.semver, n) && this.operator.startsWith("<") && t.operator.startsWith(">")));
		}
	};
	var r = p(), { safeRe: i, t: a } = f(), o = E(), s = u(), c = h(), l = O();
})), O = /* @__PURE__ */ i(((e, t) => {
	var n = /\s+/g;
	t.exports = class e {
		constructor(t, r) {
			if (r = i(r), t instanceof e) return t.loose === !!r.loose && t.includePrerelease === !!r.includePrerelease ? t : new e(t.raw, r);
			if (t instanceof a) return this.raw = t.value, this.set = [[t]], this.formatted = void 0, this;
			if (this.options = r, this.loose = !!r.loose, this.includePrerelease = !!r.includePrerelease, this.raw = t.trim().replace(n, " "), this.set = this.raw.split("||").map((e) => this.parseRange(e.trim())).filter((e) => e.length), !this.set.length) throw TypeError(`Invalid SemVer Range: ${this.raw}`);
			if (this.set.length > 1) {
				let e = this.set[0];
				if (this.set = this.set.filter((e) => !C(e[0])), this.set.length === 0) this.set = [e];
				else if (this.set.length > 1) {
					for (let e of this.set) if (e.length === 1 && w(e[0])) {
						this.set = [e];
						break;
					}
				}
			}
			this.formatted = void 0;
		}
		get range() {
			if (this.formatted === void 0) {
				this.formatted = "";
				for (let e = 0; e < this.set.length; e++) {
					e > 0 && (this.formatted += "||");
					let t = this.set[e];
					for (let e = 0; e < t.length; e++) e > 0 && (this.formatted += " "), this.formatted += t[e].toString().trim();
				}
			}
			return this.formatted;
		}
		format() {
			return this.range;
		}
		toString() {
			return this.range;
		}
		parseRange(e) {
			e = e.replace(S, "");
			let t = ((this.options.includePrerelease && y) | (this.options.loose && x)) + ":" + e, n = r.get(t);
			if (n) return n;
			let i = this.options.loose, s = i ? c[m.HYPHENRANGELOOSE] : c[m.HYPHENRANGE];
			e = e.replace(s, L(this.options.includePrerelease)), o("hyphen replace", e), e = e.replace(c[m.COMPARATORTRIM], g), o("comparator trim", e), e = e.replace(c[m.TILDETRIM], _), o("tilde trim", e), e = e.replace(c[m.CARETTRIM], v), o("caret trim", e);
			let l = e.split(" ").map((e) => E(e, this.options)).join(" ").split(/\s+/).map((e) => I(e, this.options));
			i && (l = l.filter((e) => (o("loose invalid filter", e, this.options), !!e.match(c[m.COMPARATORLOOSE])))), o("range list", l);
			let u = /* @__PURE__ */ new Map(), d = l.map((e) => new a(e, this.options));
			for (let e of d) {
				if (C(e)) return [e];
				u.set(e.value, e);
			}
			u.size > 1 && u.has("") && u.delete("");
			let f = [...u.values()];
			return r.set(t, f), f;
		}
		intersects(t, n) {
			if (!(t instanceof e)) throw TypeError("a Range is required");
			return this.set.some((e) => T(e, n) && t.set.some((t) => T(t, n) && e.every((e) => t.every((t) => e.intersects(t, n)))));
		}
		test(e) {
			if (!e) return !1;
			if (typeof e == "string") try {
				e = new s(e, this.options);
			} catch {
				return !1;
			}
			for (let t = 0; t < this.set.length; t++) if (R(this.set[t], e, this.options)) return !0;
			return !1;
		}
	};
	var r = new (b())(), i = p(), a = D(), o = u(), s = h(), { safeRe: c, src: l, t: m, comparatorTrimReplace: g, tildeTrimReplace: _, caretTrimReplace: v } = f(), { FLAG_INCLUDE_PRERELEASE: y, FLAG_LOOSE: x } = d(), S = new RegExp(l[m.BUILD], "g"), C = (e) => e.value === "<0.0.0-0", w = (e) => e.value === "", T = (e, t) => {
		let n = !0, r = e.slice(), i = r.pop();
		for (; n && r.length;) n = r.every((e) => i.intersects(e, t)), i = r.pop();
		return n;
	}, E = (e, t) => (e = e.replace(c[m.BUILD], ""), o("comp", e, t), e = j(e, t), o("caret", e), e = k(e, t), o("tildes", e), e = N(e, t), o("xrange", e), e = F(e, t), o("stars", e), e), O = (e) => !e || e.toLowerCase() === "x" || e === "*", k = (e, t) => e.trim().split(/\s+/).map((e) => A(e, t)).join(" "), A = (e, t) => {
		let n = t.loose ? c[m.TILDELOOSE] : c[m.TILDE];
		return e.replace(n, (t, n, r, i, a) => {
			o("tilde", e, t, n, r, i, a);
			let s;
			return O(n) ? s = "" : O(r) ? s = `>=${n}.0.0 <${+n + 1}.0.0-0` : O(i) ? s = `>=${n}.${r}.0 <${n}.${+r + 1}.0-0` : a ? (o("replaceTilde pr", a), s = `>=${n}.${r}.${i}-${a} <${n}.${+r + 1}.0-0`) : s = `>=${n}.${r}.${i} <${n}.${+r + 1}.0-0`, o("tilde return", s), s;
		});
	}, j = (e, t) => e.trim().split(/\s+/).map((e) => M(e, t)).join(" "), M = (e, t) => {
		o("caret", e, t);
		let n = t.loose ? c[m.CARETLOOSE] : c[m.CARET], r = t.includePrerelease ? "-0" : "";
		return e.replace(n, (t, n, i, a, s) => {
			o("caret", e, t, n, i, a, s);
			let c;
			return O(n) ? c = "" : O(i) ? c = `>=${n}.0.0${r} <${+n + 1}.0.0-0` : O(a) ? c = n === "0" ? `>=${n}.${i}.0${r} <${n}.${+i + 1}.0-0` : `>=${n}.${i}.0${r} <${+n + 1}.0.0-0` : s ? (o("replaceCaret pr", s), c = n === "0" ? i === "0" ? `>=${n}.${i}.${a}-${s} <${n}.${i}.${+a + 1}-0` : `>=${n}.${i}.${a}-${s} <${n}.${+i + 1}.0-0` : `>=${n}.${i}.${a}-${s} <${+n + 1}.0.0-0`) : (o("no pr"), c = n === "0" ? i === "0" ? `>=${n}.${i}.${a}${r} <${n}.${i}.${+a + 1}-0` : `>=${n}.${i}.${a}${r} <${n}.${+i + 1}.0-0` : `>=${n}.${i}.${a} <${+n + 1}.0.0-0`), o("caret return", c), c;
		});
	}, N = (e, t) => (o("replaceXRanges", e, t), e.split(/\s+/).map((e) => P(e, t)).join(" ")), P = (e, t) => {
		e = e.trim();
		let n = t.loose ? c[m.XRANGELOOSE] : c[m.XRANGE];
		return e.replace(n, (n, r, i, a, s, c) => {
			o("xRange", e, n, r, i, a, s, c);
			let l = O(i), u = l || O(a), d = u || O(s), f = d;
			return r === "=" && f && (r = ""), c = t.includePrerelease ? "-0" : "", l ? n = r === ">" || r === "<" ? "<0.0.0-0" : "*" : r && f ? (u && (a = 0), s = 0, r === ">" ? (r = ">=", u ? (i = +i + 1, a = 0, s = 0) : (a = +a + 1, s = 0)) : r === "<=" && (r = "<", u ? i = +i + 1 : a = +a + 1), r === "<" && (c = "-0"), n = `${r + i}.${a}.${s}${c}`) : u ? n = `>=${i}.0.0${c} <${+i + 1}.0.0-0` : d && (n = `>=${i}.${a}.0${c} <${i}.${+a + 1}.0-0`), o("xRange return", n), n;
		});
	}, F = (e, t) => (o("replaceStars", e, t), e.trim().replace(c[m.STAR], "")), I = (e, t) => (o("replaceGTE0", e, t), e.trim().replace(c[t.includePrerelease ? m.GTE0PRE : m.GTE0], "")), L = (e) => (t, n, r, i, a, o, s, c, l, u, d, f) => (n = O(r) ? "" : O(i) ? `>=${r}.0.0${e ? "-0" : ""}` : O(a) ? `>=${r}.${i}.0${e ? "-0" : ""}` : o ? `>=${n}` : `>=${n}${e ? "-0" : ""}`, c = O(l) ? "" : O(u) ? `<${+l + 1}.0.0-0` : O(d) ? `<${l}.${+u + 1}.0-0` : f ? `<=${l}.${u}.${d}-${f}` : e ? `<${l}.${u}.${+d + 1}-0` : `<=${c}`, `${n} ${c}`.trim()), R = (e, t, n) => {
		for (let n = 0; n < e.length; n++) if (!e[n].test(t)) return !1;
		if (t.prerelease.length && !n.includePrerelease) {
			for (let n = 0; n < e.length; n++) if (o(e[n].semver), e[n].semver !== a.ANY && e[n].semver.prerelease.length > 0) {
				let r = e[n].semver;
				if (r.major === t.major && r.minor === t.minor && r.patch === t.patch) return !0;
			}
			return !1;
		}
		return !0;
	};
})), k = /* @__PURE__ */ i(((e, t) => {
	var n = O();
	t.exports = (e, t, r) => {
		try {
			t = new n(t, r);
		} catch {
			return !1;
		}
		return t.test(e);
	};
})), A = /* @__PURE__ */ r({
	author: () => P,
	config: () => Y,
	contributors: () => I,
	default: () => Z,
	dependencies: () => W,
	description: () => M,
	devDependencies: () => K,
	engines: () => J,
	files: () => V,
	funding: () => X,
	homepage: () => F,
	keywords: () => U,
	license: () => q,
	main: () => z,
	name: () => j,
	optionalDependencies: () => G,
	repository: () => H,
	scripts: () => L,
	type: () => R,
	types: () => B,
	version: () => N
}), j, M, N, P, F, I, L, R, z, B, V, H, U, W, G, K, q, J, Y, X, Z, Q = n((() => {
	j = "sharp", M = "High performance Node.js image processing, the fastest module to resize JPEG, PNG, WebP, GIF, AVIF and TIFF images", N = "0.34.5", P = "Lovell Fuller <npm@lovell.info>", F = "https://sharp.pixelplumbing.com", I = /* @__PURE__ */ "Pierre Inglebert <pierre.inglebert@gmail.com>,Jonathan Ong <jonathanrichardong@gmail.com>,Chanon Sajjamanochai <chanon.s@gmail.com>,Juliano Julio <julianojulio@gmail.com>,Daniel Gasienica <daniel@gasienica.ch>,Julian Walker <julian@fiftythree.com>,Amit Pitaru <pitaru.amit@gmail.com>,Brandon Aaron <hello.brandon@aaron.sh>,Andreas Lind <andreas@one.com>,Maurus Cuelenaere <mcuelenaere@gmail.com>,Linus Unnebäck <linus@folkdatorn.se>,Victor Mateevitsi <mvictoras@gmail.com>,Alaric Holloway <alaric.holloway@gmail.com>,Bernhard K. Weisshuhn <bkw@codingforce.com>,Chris Riley <criley@primedia.com>,David Carley <dacarley@gmail.com>,John Tobin <john@limelightmobileinc.com>,Kenton Gray <kentongray@gmail.com>,Felix Bünemann <Felix.Buenemann@gmail.com>,Samy Al Zahrani <samyalzahrany@gmail.com>,Chintan Thakkar <lemnisk8@gmail.com>,F. Orlando Galashan <frulo@gmx.de>,Kleis Auke Wolthuizen <info@kleisauke.nl>,Matt Hirsch <mhirsch@media.mit.edu>,Matthias Thoemmes <thoemmes@gmail.com>,Patrick Paskaris <patrick@paskaris.gr>,Jérémy Lal <kapouer@melix.org>,Rahul Nanwani <r.nanwani@gmail.com>,Alice Monday <alice0meta@gmail.com>,Kristo Jorgenson <kristo.jorgenson@gmail.com>,YvesBos <yves_bos@outlook.com>,Guy Maliar <guy@tailorbrands.com>,Nicolas Coden <nicolas@ncoden.fr>,Matt Parrish <matt.r.parrish@gmail.com>,Marcel Bretschneider <marcel.bretschneider@gmail.com>,Matthew McEachen <matthew+github@mceachen.org>,Jarda Kotěšovec <jarda.kotesovec@gmail.com>,Kenric D'Souza <kenric.dsouza@gmail.com>,Oleh Aleinyk <oleg.aleynik@gmail.com>,Marcel Bretschneider <marcel.bretschneider@gmail.com>,Andrea Bianco <andrea.bianco@unibas.ch>,Rik Heywood <rik@rik.org>,Thomas Parisot <hi@oncletom.io>,Nathan Graves <nathanrgraves+github@gmail.com>,Tom Lokhorst <tom@lokhorst.eu>,Espen Hovlandsdal <espen@hovlandsdal.com>,Sylvain Dumont <sylvain.dumont35@gmail.com>,Alun Davies <alun.owain.davies@googlemail.com>,Aidan Hoolachan <ajhoolachan21@gmail.com>,Axel Eirola <axel.eirola@iki.fi>,Freezy <freezy@xbmc.org>,Daiz <taneli.vatanen@gmail.com>,Julian Aubourg <j@ubourg.net>,Keith Belovay <keith@picthrive.com>,Michael B. Klein <mbklein@gmail.com>,Jordan Prudhomme <jordan@raboland.fr>,Ilya Ovdin <iovdin@gmail.com>,Andargor <andargor@yahoo.com>,Paul Neave <paul.neave@gmail.com>,Brendan Kennedy <brenwken@gmail.com>,Brychan Bennett-Odlum <git@brychan.io>,Edward Silverton <e.silverton@gmail.com>,Roman Malieiev <aromaleev@gmail.com>,Tomas Szabo <tomas.szabo@deftomat.com>,Robert O'Rourke <robert@o-rourke.org>,Guillermo Alfonso Varela Chouciño <guillevch@gmail.com>,Christian Flintrup <chr@gigahost.dk>,Manan Jadhav <manan@motionden.com>,Leon Radley <leon@radley.se>,alza54 <alza54@thiocod.in>,Jacob Smith <jacob@frende.me>,Michael Nutt <michael@nutt.im>,Brad Parham <baparham@gmail.com>,Taneli Vatanen <taneli.vatanen@gmail.com>,Joris Dugué <zaruike10@gmail.com>,Chris Banks <christopher.bradley.banks@gmail.com>,Ompal Singh <ompal.hitm09@gmail.com>,Brodan <christopher.hranj@gmail.com>,Ankur Parihar <ankur.github@gmail.com>,Brahim Ait elhaj <brahima@gmail.com>,Mart Jansink <m.jansink@gmail.com>,Lachlan Newman <lachnewman007@gmail.com>,Dennis Beatty <dennis@dcbeatty.com>,Ingvar Stepanyan <me@rreverser.com>,Don Denton <don@happycollision.com>".split(","), L = {
		build: "node install/build.js",
		install: "node install/check.js || npm run build",
		clean: "rm -rf src/build/ .nyc_output/ coverage/ test/fixtures/output.*",
		test: "npm run lint && npm run test-unit",
		lint: "npm run lint-cpp && npm run lint-js && npm run lint-types",
		"lint-cpp": "cpplint --quiet src/*.h src/*.cc",
		"lint-js": "biome lint",
		"lint-types": "tsd --files ./test/types/sharp.test-d.ts",
		"test-leak": "./test/leak/leak.sh",
		"test-unit": "node --experimental-test-coverage test/unit.mjs",
		"package-from-local-build": "node npm/from-local-build.js",
		"package-release-notes": "node npm/release-notes.js",
		"docs-build": "node docs/build.mjs",
		"docs-serve": "cd docs && npm start",
		"docs-publish": "cd docs && npm run build && npx firebase-tools deploy --project pixelplumbing --only hosting:pixelplumbing-sharp"
	}, R = "commonjs", z = "lib/index.js", B = "lib/index.d.ts", V = [
		"install",
		"lib",
		"src/*.{cc,h,gyp}"
	], H = {
		type: "git",
		url: "git://github.com/lovell/sharp.git"
	}, U = [
		"jpeg",
		"png",
		"webp",
		"avif",
		"tiff",
		"gif",
		"svg",
		"jp2",
		"dzi",
		"image",
		"resize",
		"thumbnail",
		"crop",
		"embed",
		"libvips",
		"vips"
	], W = {
		"@img/colour": "^1.0.0",
		"detect-libc": "^2.1.2",
		semver: "^7.7.3"
	}, G = {
		"@img/sharp-darwin-arm64": "0.34.5",
		"@img/sharp-darwin-x64": "0.34.5",
		"@img/sharp-libvips-darwin-arm64": "1.2.4",
		"@img/sharp-libvips-darwin-x64": "1.2.4",
		"@img/sharp-libvips-linux-arm": "1.2.4",
		"@img/sharp-libvips-linux-arm64": "1.2.4",
		"@img/sharp-libvips-linux-ppc64": "1.2.4",
		"@img/sharp-libvips-linux-riscv64": "1.2.4",
		"@img/sharp-libvips-linux-s390x": "1.2.4",
		"@img/sharp-libvips-linux-x64": "1.2.4",
		"@img/sharp-libvips-linuxmusl-arm64": "1.2.4",
		"@img/sharp-libvips-linuxmusl-x64": "1.2.4",
		"@img/sharp-linux-arm": "0.34.5",
		"@img/sharp-linux-arm64": "0.34.5",
		"@img/sharp-linux-ppc64": "0.34.5",
		"@img/sharp-linux-riscv64": "0.34.5",
		"@img/sharp-linux-s390x": "0.34.5",
		"@img/sharp-linux-x64": "0.34.5",
		"@img/sharp-linuxmusl-arm64": "0.34.5",
		"@img/sharp-linuxmusl-x64": "0.34.5",
		"@img/sharp-wasm32": "0.34.5",
		"@img/sharp-win32-arm64": "0.34.5",
		"@img/sharp-win32-ia32": "0.34.5",
		"@img/sharp-win32-x64": "0.34.5"
	}, K = {
		"@biomejs/biome": "^2.3.4",
		"@cpplint/cli": "^0.1.0",
		"@emnapi/runtime": "^1.7.0",
		"@img/sharp-libvips-dev": "1.2.4",
		"@img/sharp-libvips-dev-wasm32": "1.2.4",
		"@img/sharp-libvips-win32-arm64": "1.2.4",
		"@img/sharp-libvips-win32-ia32": "1.2.4",
		"@img/sharp-libvips-win32-x64": "1.2.4",
		"@types/node": "*",
		emnapi: "^1.7.0",
		"exif-reader": "^2.0.2",
		"extract-zip": "^2.0.1",
		icc: "^3.0.0",
		"jsdoc-to-markdown": "^9.1.3",
		"node-addon-api": "^8.5.0",
		"node-gyp": "^11.5.0",
		"tar-fs": "^3.1.1",
		tsd: "^0.33.0"
	}, q = "Apache-2.0", J = { node: "^18.17.0 || ^20.3.0 || >=21.0.0" }, Y = { libvips: ">=8.17.3" }, X = { url: "https://opencollective.com/libvips" }, Z = {
		name: j,
		description: M,
		version: N,
		author: P,
		homepage: F,
		contributors: I,
		scripts: L,
		type: R,
		main: z,
		types: B,
		files: V,
		repository: H,
		keywords: U,
		dependencies: W,
		optionalDependencies: G,
		devDependencies: K,
		license: q,
		engines: J,
		config: Y,
		funding: X
	};
})), ee = /* @__PURE__ */ i(((n, r) => {
	var { spawnSync: i } = t("node:child_process"), { createHash: a } = t("node:crypto"), o = _(), s = y(), c = k(), u = l(), { config: d, engines: f, optionalDependencies: p } = (Q(), e(A).default), m = o(process.env.npm_package_config_libvips || d.libvips).version, h = [
		"darwin-arm64",
		"darwin-x64",
		"linux-arm",
		"linux-arm64",
		"linux-ppc64",
		"linux-riscv64",
		"linux-s390x",
		"linux-x64",
		"linuxmusl-arm64",
		"linuxmusl-x64",
		"win32-arm64",
		"win32-ia32",
		"win32-x64"
	], g = {
		encoding: "utf8",
		shell: !0
	}, v = (e) => {
		e instanceof Error ? console.error(`sharp: Installation error: ${e.message}`) : console.log(`sharp: ${e}`);
	}, b = () => u.isNonGlibcLinuxSync() ? u.familySync() : "", x = () => `${process.platform}${b()}-${process.arch}`, S = () => {
		/* node:coverage ignore next 3 */
		if (D()) return "wasm32";
		let { npm_config_arch: e, npm_config_platform: t, npm_config_libc: n } = process.env, r = typeof n == "string" ? n : b();
		return `${t || process.platform}${r}-${e || process.arch}`;
	}, C = () => {
		try {
			return t(`@img/sharp-libvips-dev-${S()}/include`);
		} catch {
			/* node:coverage ignore next 5 */
			try {
				return t("@img/sharp-libvips-dev/include");
			} catch {}
		}
		return "";
	}, w = () => {
		/* node:coverage ignore next 4 */
		try {
			return t("@img/sharp-libvips-dev/cplusplus");
		} catch {}
		return "";
	}, T = () => {
		try {
			return t(`@img/sharp-libvips-dev-${S()}/lib`);
		} catch {
			/* node:coverage ignore next 5 */
			try {
				return t(`@img/sharp-libvips-${S()}/lib`);
			} catch {}
		}
		return "";
	}, E = () => {
		if (process.release?.name === "node" && process.versions && !c(process.versions.node, f.node)) return {
			found: process.versions.node,
			expected: f.node
		};
	}, D = () => {
		let { CC: e } = process.env;
		return !!e?.endsWith("/emcc");
	}, O = () => process.platform === "darwin" && process.arch === "x64" ? (i("sysctl sysctl.proc_translated", g).stdout || "").trim() === "sysctl.proc_translated: 1" : !1, j = (e) => a("sha512").update(e).digest("hex"), M = () => {
		try {
			let e = j(`imgsharp-libvips-${S()}`), t = o(p[`@img/sharp-libvips-${S()}`], { includePrerelease: !0 }).version;
			return j(`${e}npm:${t}`).slice(0, 10);
		} catch {}
		return "";
	}, N = () => i(`node-gyp rebuild --directory=src ${D() ? "--nodedir=emscripten" : ""}`, {
		...g,
		stdio: "inherit"
	}).status, P = () => process.platform === "win32" ? "" : (i("pkg-config --modversion vips-cpp", {
		...g,
		env: {
			...process.env,
			PKG_CONFIG_PATH: F()
		}
	}).stdout || "").trim(), F = () => process.platform === "win32" ? "" : [
		(i("which brew >/dev/null 2>&1 && brew environment --plain | grep PKG_CONFIG_LIBDIR | cut -d\" \" -f2", g).stdout || "").trim(),
		process.env.PKG_CONFIG_PATH,
		"/usr/local/lib/pkgconfig",
		"/usr/lib/pkgconfig",
		"/usr/local/libdata/pkgconfig",
		"/usr/libdata/pkgconfig"
	].filter(Boolean).join(":"), I = (e, t, n) => (n && n(`Detected ${t}, skipping search for globally-installed libvips`), e);
	r.exports = {
		minimumLibvipsVersion: m,
		prebuiltPlatforms: h,
		buildPlatformArch: S,
		buildSharpLibvipsIncludeDir: C,
		buildSharpLibvipsCPlusPlusDir: w,
		buildSharpLibvipsLibDir: T,
		isUnsupportedNodeRuntime: E,
		runtimePlatformArch: x,
		log: v,
		yarnLocator: M,
		spawnRebuild: N,
		globalLibvipsVersion: P,
		pkgConfigPath: F,
		useGlobalLibvips: (e) => {
			if (process.env.SHARP_IGNORE_GLOBAL_LIBVIPS) return I(!1, "SHARP_IGNORE_GLOBAL_LIBVIPS", e);
			if (process.env.SHARP_FORCE_GLOBAL_LIBVIPS) return I(!0, "SHARP_FORCE_GLOBAL_LIBVIPS", e);
			/* node:coverage ignore next 3 */
			if (O()) return I(!1, "Rosetta", e);
			let t = P();
			/* node:coverage ignore next */
			return !!t && s(t, m);
		}
	};
})), $ = /* @__PURE__ */ i(((e, n) => {
	var { familySync: r, versionSync: i } = l(), { runtimePlatformArch: a, isUnsupportedNodeRuntime: o, prebuiltPlatforms: s, minimumLibvipsVersion: c } = ee(), u = a(), d = [
		`../src/build/Release/sharp-${u}.node`,
		"../src/build/Release/sharp-wasm32.node",
		`@img/sharp-${u}/sharp.node`,
		"@img/sharp-wasm32/sharp.node"
	], f, p, m = [];
	for (f of d) try {
		p = t(f);
		break;
	} catch (e) {
		m.push(e);
	}
	if (p && f.startsWith("@img/sharp-linux-x64") && !p._isUsingX64V2()) {
		let e = /* @__PURE__ */ Error("Prebuilt binaries for linux-x64 require v2 microarchitecture");
		e.code = "Unsupported CPU", m.push(e), p = null;
	}
	if (p) n.exports = p;
	else {
		let [e, n, a] = [
			"linux",
			"darwin",
			"win32"
		].map((e) => u.startsWith(e)), l = [`Could not load the "sharp" module using the ${u} runtime`];
		m.forEach((e) => {
			e.code !== "MODULE_NOT_FOUND" && l.push(`${e.code}: ${e.message}`);
		});
		let d = m.map((e) => e.message).join(" ");
		if (l.push("Possible solutions:"), o()) {
			let { found: e, expected: t } = o();
			l.push("- Please upgrade Node.js:", `    Found ${e}`, `    Requires ${t}`);
		} else if (s.includes(u)) {
			let [e, t] = u.split("-"), n = e.endsWith("musl") ? " --libc=musl" : "";
			l.push("- Ensure optional dependencies can be installed:", "    npm install --include=optional sharp", "- Ensure your package manager supports multi-platform installation:", "    See https://sharp.pixelplumbing.com/install#cross-platform", "- Add platform-specific dependencies:", `    npm install --os=${e.replace("musl", "")}${n} --cpu=${t} sharp`);
		} else l.push(`- Manually install libvips >= ${c}`, "- Add experimental WebAssembly-based dependencies:", "    npm install --cpu=wasm32 sharp", "    npm install @img/sharp-wasm32");
		if (e && /(symbol not found|CXXABI_)/i.test(d)) try {
			let { config: e } = t(`@img/sharp-libvips-${u}/package`), n = `${r()} ${i()}`, a = `${e.musl ? "musl" : "glibc"} ${e.musl || e.glibc}`;
			l.push("- Update your OS:", `    Found ${n}`, `    Requires ${a}`);
		} catch {}
		throw e && /\/snap\/core[0-9]{2}/.test(d) && l.push("- Remove the Node.js Snap, which does not support native modules", "    snap remove node"), n && /Incompatible library version/.test(d) && l.push("- Update Homebrew:", "    brew update && brew upgrade vips"), m.some((e) => e.code === "ERR_DLOPEN_DISABLED") && l.push("- Run Node.js without using the --no-addons flag"), a && /The specified procedure could not be found/.test(d) && l.push("- Using the canvas package on Windows?", "    See https://sharp.pixelplumbing.com/install#canvas-and-windows", "- Check for outdated versions of sharp in the dependency tree:", "    npm ls sharp"), l.push("- Consult the installation documentation:", "    See https://sharp.pixelplumbing.com/install"), Error(l.join("\n"));
	}
})), te = /* @__PURE__ */ i(((e, n) => {
	var r = t("node:util"), i = t("node:stream"), o = a();
	$();
	var s = r.debuglog("sharp"), c = (e) => {
		l.queue.emit("change", e);
	}, l = function(e, t) {
		if (arguments.length === 1 && !o.defined(e)) throw Error("Invalid input");
		return this instanceof l ? (i.Duplex.call(this), this.options = {
			topOffsetPre: -1,
			leftOffsetPre: -1,
			widthPre: -1,
			heightPre: -1,
			topOffsetPost: -1,
			leftOffsetPost: -1,
			widthPost: -1,
			heightPost: -1,
			width: -1,
			height: -1,
			canvas: "crop",
			position: 0,
			resizeBackground: [
				0,
				0,
				0,
				255
			],
			angle: 0,
			rotationAngle: 0,
			rotationBackground: [
				0,
				0,
				0,
				255
			],
			rotateBefore: !1,
			orientBefore: !1,
			flip: !1,
			flop: !1,
			extendTop: 0,
			extendBottom: 0,
			extendLeft: 0,
			extendRight: 0,
			extendBackground: [
				0,
				0,
				0,
				255
			],
			extendWith: "background",
			withoutEnlargement: !1,
			withoutReduction: !1,
			affineMatrix: [],
			affineBackground: [
				0,
				0,
				0,
				255
			],
			affineIdx: 0,
			affineIdy: 0,
			affineOdx: 0,
			affineOdy: 0,
			affineInterpolator: this.constructor.interpolators.bilinear,
			kernel: "lanczos3",
			fastShrinkOnLoad: !0,
			tint: [
				-1,
				0,
				0,
				0
			],
			flatten: !1,
			flattenBackground: [
				0,
				0,
				0
			],
			unflatten: !1,
			negate: !1,
			negateAlpha: !0,
			medianSize: 0,
			blurSigma: 0,
			precision: "integer",
			minAmpl: .2,
			sharpenSigma: 0,
			sharpenM1: 1,
			sharpenM2: 2,
			sharpenX1: 2,
			sharpenY2: 10,
			sharpenY3: 20,
			threshold: 0,
			thresholdGrayscale: !0,
			trimBackground: [],
			trimThreshold: -1,
			trimLineArt: !1,
			dilateWidth: 0,
			erodeWidth: 0,
			gamma: 0,
			gammaOut: 0,
			greyscale: !1,
			normalise: !1,
			normaliseLower: 1,
			normaliseUpper: 99,
			claheWidth: 0,
			claheHeight: 0,
			claheMaxSlope: 3,
			brightness: 1,
			saturation: 1,
			hue: 0,
			lightness: 0,
			booleanBufferIn: null,
			booleanFileIn: "",
			joinChannelIn: [],
			extractChannel: -1,
			removeAlpha: !1,
			ensureAlpha: -1,
			colourspace: "srgb",
			colourspacePipeline: "last",
			composite: [],
			fileOut: "",
			formatOut: "input",
			streamOut: !1,
			keepMetadata: 0,
			withMetadataOrientation: -1,
			withMetadataDensity: 0,
			withIccProfile: "",
			withExif: {},
			withExifMerge: !0,
			withXmp: "",
			resolveWithObject: !1,
			loop: -1,
			delay: [],
			jpegQuality: 80,
			jpegProgressive: !1,
			jpegChromaSubsampling: "4:2:0",
			jpegTrellisQuantisation: !1,
			jpegOvershootDeringing: !1,
			jpegOptimiseScans: !1,
			jpegOptimiseCoding: !0,
			jpegQuantisationTable: 0,
			pngProgressive: !1,
			pngCompressionLevel: 6,
			pngAdaptiveFiltering: !1,
			pngPalette: !1,
			pngQuality: 100,
			pngEffort: 7,
			pngBitdepth: 8,
			pngDither: 1,
			jp2Quality: 80,
			jp2TileHeight: 512,
			jp2TileWidth: 512,
			jp2Lossless: !1,
			jp2ChromaSubsampling: "4:4:4",
			webpQuality: 80,
			webpAlphaQuality: 100,
			webpLossless: !1,
			webpNearLossless: !1,
			webpSmartSubsample: !1,
			webpSmartDeblock: !1,
			webpPreset: "default",
			webpEffort: 4,
			webpMinSize: !1,
			webpMixed: !1,
			gifBitdepth: 8,
			gifEffort: 7,
			gifDither: 1,
			gifInterFrameMaxError: 0,
			gifInterPaletteMaxError: 3,
			gifKeepDuplicateFrames: !1,
			gifReuse: !0,
			gifProgressive: !1,
			tiffQuality: 80,
			tiffCompression: "jpeg",
			tiffBigtiff: !1,
			tiffPredictor: "horizontal",
			tiffPyramid: !1,
			tiffMiniswhite: !1,
			tiffBitdepth: 8,
			tiffTile: !1,
			tiffTileHeight: 256,
			tiffTileWidth: 256,
			tiffXres: 1,
			tiffYres: 1,
			tiffResolutionUnit: "inch",
			heifQuality: 50,
			heifLossless: !1,
			heifCompression: "av1",
			heifEffort: 4,
			heifChromaSubsampling: "4:4:4",
			heifBitdepth: 8,
			jxlDistance: 1,
			jxlDecodingTier: 0,
			jxlEffort: 7,
			jxlLossless: !1,
			rawDepth: "uchar",
			tileSize: 256,
			tileOverlap: 0,
			tileContainer: "fs",
			tileLayout: "dz",
			tileFormat: "last",
			tileDepth: "last",
			tileAngle: 0,
			tileSkipBlanks: -1,
			tileBackground: [
				255,
				255,
				255,
				255
			],
			tileCentre: !1,
			tileId: "https://example.com/iiif",
			tileBasename: "",
			timeoutSeconds: 0,
			linearA: [],
			linearB: [],
			pdfBackground: [
				255,
				255,
				255,
				255
			],
			debuglog: (e) => {
				this.emit("warning", e), s(e);
			},
			queueListener: c
		}, this.options.input = this._createInputDescriptor(e, t, { allowStream: !0 }), this) : new l(e, t);
	};
	Object.setPrototypeOf(l.prototype, i.Duplex.prototype), Object.setPrototypeOf(l, i.Duplex);
	function u() {
		let e = this.constructor.call(), { debuglog: t, queueListener: n, ...r } = this.options;
		return e.options = structuredClone(r), e.options.debuglog = t, e.options.queueListener = n, this._isStreamInput() && this.on("finish", () => {
			this._flattenBufferIn(), e.options.input.buffer = this.options.input.buffer, e.emit("finish");
		}), e;
	}
	Object.assign(l.prototype, { clone: u }), n.exports = l;
})), ne = /* @__PURE__ */ i(((e, t) => {
	var n = a(), r = $(), i = {
		left: "low",
		top: "low",
		low: "low",
		center: "centre",
		centre: "centre",
		right: "high",
		bottom: "high",
		high: "high"
	}, o = [
		"failOn",
		"limitInputPixels",
		"unlimited",
		"animated",
		"autoOrient",
		"density",
		"ignoreIcc",
		"page",
		"pages",
		"sequentialRead",
		"jp2",
		"openSlide",
		"pdf",
		"raw",
		"svg",
		"tiff",
		"failOnError",
		"openSlideLevel",
		"pdfBackground",
		"tiffSubifd"
	];
	function s(e) {
		let t = o.filter((t) => n.defined(e[t])).map((t) => [t, e[t]]);
		return t.length ? Object.fromEntries(t) : void 0;
	}
	function c(e, t, r) {
		let i = {
			autoOrient: !1,
			failOn: "warning",
			limitInputPixels: 16383 ** 2,
			ignoreIcc: !1,
			unlimited: !1,
			sequentialRead: !0
		};
		if (n.string(e)) i.file = e;
		else if (n.buffer(e)) {
			if (e.length === 0) throw Error("Input Buffer is empty");
			i.buffer = e;
		} else if (n.arrayBuffer(e)) {
			if (e.byteLength === 0) throw Error("Input bit Array is empty");
			i.buffer = Buffer.from(e, 0, e.byteLength);
		} else if (n.typedArray(e)) {
			if (e.length === 0) throw Error("Input Bit Array is empty");
			i.buffer = Buffer.from(e.buffer, e.byteOffset, e.byteLength);
		} else if (n.plainObject(e) && !n.defined(t)) t = e, s(t) && (i.buffer = []);
		else if (!n.defined(e) && !n.defined(t) && n.object(r) && r.allowStream) i.buffer = [];
		else if (Array.isArray(e)) if (e.length > 1) if (!this.options.joining) this.options.joining = !0, this.options.join = e.map((e) => this._createInputDescriptor(e));
		else throw Error("Recursive join is unsupported");
		else throw Error("Expected at least two images to join");
		else throw Error(`Unsupported input '${e}' of type ${typeof e}${n.defined(t) ? ` when also providing options of type ${typeof t}` : ""}`);
		if (n.object(t)) {
			if (n.defined(t.failOnError)) if (n.bool(t.failOnError)) i.failOn = t.failOnError ? "warning" : "none";
			else throw n.invalidParameterError("failOnError", "boolean", t.failOnError);
			if (n.defined(t.failOn)) if (n.string(t.failOn) && n.inArray(t.failOn, [
				"none",
				"truncated",
				"error",
				"warning"
			])) i.failOn = t.failOn;
			else throw n.invalidParameterError("failOn", "one of: none, truncated, error, warning", t.failOn);
			if (n.defined(t.autoOrient)) if (n.bool(t.autoOrient)) i.autoOrient = t.autoOrient;
			else throw n.invalidParameterError("autoOrient", "boolean", t.autoOrient);
			if (n.defined(t.density)) if (n.inRange(t.density, 1, 1e5)) i.density = t.density;
			else throw n.invalidParameterError("density", "number between 1 and 100000", t.density);
			if (n.defined(t.ignoreIcc)) if (n.bool(t.ignoreIcc)) i.ignoreIcc = t.ignoreIcc;
			else throw n.invalidParameterError("ignoreIcc", "boolean", t.ignoreIcc);
			if (n.defined(t.limitInputPixels)) if (n.bool(t.limitInputPixels)) i.limitInputPixels = t.limitInputPixels ? 16383 ** 2 : 0;
			else if (n.integer(t.limitInputPixels) && n.inRange(t.limitInputPixels, 0, 2 ** 53 - 1)) i.limitInputPixels = t.limitInputPixels;
			else throw n.invalidParameterError("limitInputPixels", "positive integer", t.limitInputPixels);
			if (n.defined(t.unlimited)) if (n.bool(t.unlimited)) i.unlimited = t.unlimited;
			else throw n.invalidParameterError("unlimited", "boolean", t.unlimited);
			if (n.defined(t.sequentialRead)) if (n.bool(t.sequentialRead)) i.sequentialRead = t.sequentialRead;
			else throw n.invalidParameterError("sequentialRead", "boolean", t.sequentialRead);
			if (n.defined(t.raw)) {
				if (n.object(t.raw) && n.integer(t.raw.width) && t.raw.width > 0 && n.integer(t.raw.height) && t.raw.height > 0 && n.integer(t.raw.channels) && n.inRange(t.raw.channels, 1, 4)) switch (i.rawWidth = t.raw.width, i.rawHeight = t.raw.height, i.rawChannels = t.raw.channels, e.constructor) {
					case Uint8Array:
					case Uint8ClampedArray:
						i.rawDepth = "uchar";
						break;
					case Int8Array:
						i.rawDepth = "char";
						break;
					case Uint16Array:
						i.rawDepth = "ushort";
						break;
					case Int16Array:
						i.rawDepth = "short";
						break;
					case Uint32Array:
						i.rawDepth = "uint";
						break;
					case Int32Array:
						i.rawDepth = "int";
						break;
					case Float32Array:
						i.rawDepth = "float";
						break;
					case Float64Array:
						i.rawDepth = "double";
						break;
					default:
						i.rawDepth = "uchar";
						break;
				}
				else throw Error("Expected width, height and channels for raw pixel input");
				if (i.rawPremultiplied = !1, n.defined(t.raw.premultiplied)) if (n.bool(t.raw.premultiplied)) i.rawPremultiplied = t.raw.premultiplied;
				else throw n.invalidParameterError("raw.premultiplied", "boolean", t.raw.premultiplied);
				if (i.rawPageHeight = 0, n.defined(t.raw.pageHeight)) if (n.integer(t.raw.pageHeight) && t.raw.pageHeight > 0 && t.raw.pageHeight <= t.raw.height) {
					if (t.raw.height % t.raw.pageHeight !== 0) throw Error(`Expected raw.height ${t.raw.height} to be a multiple of raw.pageHeight ${t.raw.pageHeight}`);
					i.rawPageHeight = t.raw.pageHeight;
				} else throw n.invalidParameterError("raw.pageHeight", "positive integer", t.raw.pageHeight);
			}
			if (n.defined(t.animated)) if (n.bool(t.animated)) i.pages = t.animated ? -1 : 1;
			else throw n.invalidParameterError("animated", "boolean", t.animated);
			if (n.defined(t.pages)) if (n.integer(t.pages) && n.inRange(t.pages, -1, 1e5)) i.pages = t.pages;
			else throw n.invalidParameterError("pages", "integer between -1 and 100000", t.pages);
			if (n.defined(t.page)) if (n.integer(t.page) && n.inRange(t.page, 0, 1e5)) i.page = t.page;
			else throw n.invalidParameterError("page", "integer between 0 and 100000", t.page);
			if (n.object(t.openSlide) && n.defined(t.openSlide.level)) if (n.integer(t.openSlide.level) && n.inRange(t.openSlide.level, 0, 256)) i.openSlideLevel = t.openSlide.level;
			else throw n.invalidParameterError("openSlide.level", "integer between 0 and 256", t.openSlide.level);
			else if (n.defined(t.level)) if (n.integer(t.level) && n.inRange(t.level, 0, 256)) i.openSlideLevel = t.level;
			else throw n.invalidParameterError("level", "integer between 0 and 256", t.level);
			if (n.object(t.tiff) && n.defined(t.tiff.subifd)) if (n.integer(t.tiff.subifd) && n.inRange(t.tiff.subifd, -1, 1e5)) i.tiffSubifd = t.tiff.subifd;
			else throw n.invalidParameterError("tiff.subifd", "integer between -1 and 100000", t.tiff.subifd);
			else if (n.defined(t.subifd)) if (n.integer(t.subifd) && n.inRange(t.subifd, -1, 1e5)) i.tiffSubifd = t.subifd;
			else throw n.invalidParameterError("subifd", "integer between -1 and 100000", t.subifd);
			if (n.object(t.svg)) {
				if (n.defined(t.svg.stylesheet)) if (n.string(t.svg.stylesheet)) i.svgStylesheet = t.svg.stylesheet;
				else throw n.invalidParameterError("svg.stylesheet", "string", t.svg.stylesheet);
				if (n.defined(t.svg.highBitdepth)) if (n.bool(t.svg.highBitdepth)) i.svgHighBitdepth = t.svg.highBitdepth;
				else throw n.invalidParameterError("svg.highBitdepth", "boolean", t.svg.highBitdepth);
			}
			if (n.object(t.pdf) && n.defined(t.pdf.background) ? i.pdfBackground = this._getBackgroundColourOption(t.pdf.background) : n.defined(t.pdfBackground) && (i.pdfBackground = this._getBackgroundColourOption(t.pdfBackground)), n.object(t.jp2) && n.defined(t.jp2.oneshot)) if (n.bool(t.jp2.oneshot)) i.jp2Oneshot = t.jp2.oneshot;
			else throw n.invalidParameterError("jp2.oneshot", "boolean", t.jp2.oneshot);
			if (n.defined(t.create)) if (n.object(t.create) && n.integer(t.create.width) && t.create.width > 0 && n.integer(t.create.height) && t.create.height > 0 && n.integer(t.create.channels)) {
				if (i.createWidth = t.create.width, i.createHeight = t.create.height, i.createChannels = t.create.channels, i.createPageHeight = 0, n.defined(t.create.pageHeight)) if (n.integer(t.create.pageHeight) && t.create.pageHeight > 0 && t.create.pageHeight <= t.create.height) {
					if (t.create.height % t.create.pageHeight !== 0) throw Error(`Expected create.height ${t.create.height} to be a multiple of create.pageHeight ${t.create.pageHeight}`);
					i.createPageHeight = t.create.pageHeight;
				} else throw n.invalidParameterError("create.pageHeight", "positive integer", t.create.pageHeight);
				if (n.defined(t.create.noise)) {
					if (!n.object(t.create.noise)) throw Error("Expected noise to be an object");
					if (t.create.noise.type !== "gaussian") throw Error("Only gaussian noise is supported at the moment");
					if (i.createNoiseType = t.create.noise.type, !n.inRange(t.create.channels, 1, 4)) throw n.invalidParameterError("create.channels", "number between 1 and 4", t.create.channels);
					if (i.createNoiseMean = 128, n.defined(t.create.noise.mean)) if (n.number(t.create.noise.mean) && n.inRange(t.create.noise.mean, 0, 1e4)) i.createNoiseMean = t.create.noise.mean;
					else throw n.invalidParameterError("create.noise.mean", "number between 0 and 10000", t.create.noise.mean);
					if (i.createNoiseSigma = 30, n.defined(t.create.noise.sigma)) if (n.number(t.create.noise.sigma) && n.inRange(t.create.noise.sigma, 0, 1e4)) i.createNoiseSigma = t.create.noise.sigma;
					else throw n.invalidParameterError("create.noise.sigma", "number between 0 and 10000", t.create.noise.sigma);
				} else if (n.defined(t.create.background)) {
					if (!n.inRange(t.create.channels, 3, 4)) throw n.invalidParameterError("create.channels", "number between 3 and 4", t.create.channels);
					i.createBackground = this._getBackgroundColourOption(t.create.background);
				} else throw Error("Expected valid noise or background to create a new input image");
				delete i.buffer;
			} else throw Error("Expected valid width, height and channels to create a new input image");
			if (n.defined(t.text)) if (n.object(t.text) && n.string(t.text.text)) {
				if (i.textValue = t.text.text, n.defined(t.text.height) && n.defined(t.text.dpi)) throw Error("Expected only one of dpi or height");
				if (n.defined(t.text.font)) if (n.string(t.text.font)) i.textFont = t.text.font;
				else throw n.invalidParameterError("text.font", "string", t.text.font);
				if (n.defined(t.text.fontfile)) if (n.string(t.text.fontfile)) i.textFontfile = t.text.fontfile;
				else throw n.invalidParameterError("text.fontfile", "string", t.text.fontfile);
				if (n.defined(t.text.width)) if (n.integer(t.text.width) && t.text.width > 0) i.textWidth = t.text.width;
				else throw n.invalidParameterError("text.width", "positive integer", t.text.width);
				if (n.defined(t.text.height)) if (n.integer(t.text.height) && t.text.height > 0) i.textHeight = t.text.height;
				else throw n.invalidParameterError("text.height", "positive integer", t.text.height);
				if (n.defined(t.text.align)) if (n.string(t.text.align) && n.string(this.constructor.align[t.text.align])) i.textAlign = this.constructor.align[t.text.align];
				else throw n.invalidParameterError("text.align", "valid alignment", t.text.align);
				if (n.defined(t.text.justify)) if (n.bool(t.text.justify)) i.textJustify = t.text.justify;
				else throw n.invalidParameterError("text.justify", "boolean", t.text.justify);
				if (n.defined(t.text.dpi)) if (n.integer(t.text.dpi) && n.inRange(t.text.dpi, 1, 1e6)) i.textDpi = t.text.dpi;
				else throw n.invalidParameterError("text.dpi", "integer between 1 and 1000000", t.text.dpi);
				if (n.defined(t.text.rgba)) if (n.bool(t.text.rgba)) i.textRgba = t.text.rgba;
				else throw n.invalidParameterError("text.rgba", "bool", t.text.rgba);
				if (n.defined(t.text.spacing)) if (n.integer(t.text.spacing) && n.inRange(t.text.spacing, -1e6, 1e6)) i.textSpacing = t.text.spacing;
				else throw n.invalidParameterError("text.spacing", "integer between -1000000 and 1000000", t.text.spacing);
				if (n.defined(t.text.wrap)) if (n.string(t.text.wrap) && n.inArray(t.text.wrap, [
					"word",
					"char",
					"word-char",
					"none"
				])) i.textWrap = t.text.wrap;
				else throw n.invalidParameterError("text.wrap", "one of: word, char, word-char, none", t.text.wrap);
				delete i.buffer;
			} else throw Error("Expected a valid string to create an image with text.");
			if (n.defined(t.join)) if (n.defined(this.options.join)) {
				if (n.defined(t.join.animated)) if (n.bool(t.join.animated)) i.joinAnimated = t.join.animated;
				else throw n.invalidParameterError("join.animated", "boolean", t.join.animated);
				if (n.defined(t.join.across)) if (n.integer(t.join.across) && n.inRange(t.join.across, 1, 1e6)) i.joinAcross = t.join.across;
				else throw n.invalidParameterError("join.across", "integer between 1 and 100000", t.join.across);
				if (n.defined(t.join.shim)) if (n.integer(t.join.shim) && n.inRange(t.join.shim, 0, 1e6)) i.joinShim = t.join.shim;
				else throw n.invalidParameterError("join.shim", "integer between 0 and 100000", t.join.shim);
				if (n.defined(t.join.background) && (i.joinBackground = this._getBackgroundColourOption(t.join.background)), n.defined(t.join.halign)) if (n.string(t.join.halign) && n.string(this.constructor.align[t.join.halign])) i.joinHalign = this.constructor.align[t.join.halign];
				else throw n.invalidParameterError("join.halign", "valid alignment", t.join.halign);
				if (n.defined(t.join.valign)) if (n.string(t.join.valign) && n.string(this.constructor.align[t.join.valign])) i.joinValign = this.constructor.align[t.join.valign];
				else throw n.invalidParameterError("join.valign", "valid alignment", t.join.valign);
			} else throw Error("Expected input to be an array of images to join");
		} else if (n.defined(t)) throw Error(`Invalid input options ${t}`);
		return i;
	}
	function l(e, t, r) {
		Array.isArray(this.options.input.buffer) ? n.buffer(e) ? (this.options.input.buffer.length === 0 && this.on("finish", () => {
			this.streamInFinished = !0;
		}), this.options.input.buffer.push(e), r()) : r(/* @__PURE__ */ Error("Non-Buffer data on Writable Stream")) : r(/* @__PURE__ */ Error("Unexpected data on Writable Stream"));
	}
	function u() {
		this._isStreamInput() && (this.options.input.buffer = Buffer.concat(this.options.input.buffer));
	}
	function d() {
		return Array.isArray(this.options.input.buffer);
	}
	function f(e) {
		let t = Error();
		return n.fn(e) ? (this._isStreamInput() ? this.on("finish", () => {
			this._flattenBufferIn(), r.metadata(this.options, (r, i) => {
				r ? e(n.nativeError(r, t)) : e(null, i);
			});
		}) : r.metadata(this.options, (r, i) => {
			r ? e(n.nativeError(r, t)) : e(null, i);
		}), this) : this._isStreamInput() ? new Promise((e, i) => {
			let a = () => {
				this._flattenBufferIn(), r.metadata(this.options, (r, a) => {
					r ? i(n.nativeError(r, t)) : e(a);
				});
			};
			this.writableFinished ? a() : this.once("finish", a);
		}) : new Promise((e, i) => {
			r.metadata(this.options, (r, a) => {
				r ? i(n.nativeError(r, t)) : e(a);
			});
		});
	}
	function p(e) {
		let t = Error();
		return n.fn(e) ? (this._isStreamInput() ? this.on("finish", () => {
			this._flattenBufferIn(), r.stats(this.options, (r, i) => {
				r ? e(n.nativeError(r, t)) : e(null, i);
			});
		}) : r.stats(this.options, (r, i) => {
			r ? e(n.nativeError(r, t)) : e(null, i);
		}), this) : this._isStreamInput() ? new Promise((e, i) => {
			this.on("finish", function() {
				this._flattenBufferIn(), r.stats(this.options, (r, a) => {
					r ? i(n.nativeError(r, t)) : e(a);
				});
			});
		}) : new Promise((e, i) => {
			r.stats(this.options, (r, a) => {
				r ? i(n.nativeError(r, t)) : e(a);
			});
		});
	}
	t.exports = (e) => {
		Object.assign(e.prototype, {
			_inputOptionsFromObject: s,
			_createInputDescriptor: c,
			_write: l,
			_flattenBufferIn: u,
			_isStreamInput: d,
			metadata: f,
			stats: p
		}), e.align = i;
	};
})), re = /* @__PURE__ */ i(((e, t) => {
	var n = a(), r = {
		center: 0,
		centre: 0,
		north: 1,
		east: 2,
		south: 3,
		west: 4,
		northeast: 5,
		southeast: 6,
		southwest: 7,
		northwest: 8
	}, i = {
		top: 1,
		right: 2,
		bottom: 3,
		left: 4,
		"right top": 5,
		"right bottom": 6,
		"left bottom": 7,
		"left top": 8
	}, o = {
		background: "background",
		copy: "copy",
		repeat: "repeat",
		mirror: "mirror"
	}, s = {
		entropy: 16,
		attention: 17
	}, c = {
		nearest: "nearest",
		linear: "linear",
		cubic: "cubic",
		mitchell: "mitchell",
		lanczos2: "lanczos2",
		lanczos3: "lanczos3",
		mks2013: "mks2013",
		mks2021: "mks2021"
	}, l = {
		contain: "contain",
		cover: "cover",
		fill: "fill",
		inside: "inside",
		outside: "outside"
	}, u = {
		contain: "embed",
		cover: "crop",
		fill: "ignore_aspect",
		inside: "max",
		outside: "min"
	};
	function d(e) {
		return e.angle % 360 != 0 || e.rotationAngle !== 0;
	}
	function f(e) {
		return e.width !== -1 || e.height !== -1;
	}
	function p(e, t, a) {
		if (f(this.options) && this.options.debuglog("ignoring previous resize options"), this.options.widthPost !== -1 && this.options.debuglog("operation order will be: extract, resize, extract"), n.defined(e)) if (n.object(e) && !n.defined(a)) a = e;
		else if (n.integer(e) && e > 0) this.options.width = e;
		else throw n.invalidParameterError("width", "positive integer", e);
		else this.options.width = -1;
		if (n.defined(t)) if (n.integer(t) && t > 0) this.options.height = t;
		else throw n.invalidParameterError("height", "positive integer", t);
		else this.options.height = -1;
		if (n.object(a)) {
			if (n.defined(a.width)) if (n.integer(a.width) && a.width > 0) this.options.width = a.width;
			else throw n.invalidParameterError("width", "positive integer", a.width);
			if (n.defined(a.height)) if (n.integer(a.height) && a.height > 0) this.options.height = a.height;
			else throw n.invalidParameterError("height", "positive integer", a.height);
			if (n.defined(a.fit)) {
				let e = u[a.fit];
				if (n.string(e)) this.options.canvas = e;
				else throw n.invalidParameterError("fit", "valid fit", a.fit);
			}
			if (n.defined(a.position)) {
				let e = n.integer(a.position) ? a.position : s[a.position] || i[a.position] || r[a.position];
				if (n.integer(e) && (n.inRange(e, 0, 8) || n.inRange(e, 16, 17))) this.options.position = e;
				else throw n.invalidParameterError("position", "valid position/gravity/strategy", a.position);
			}
			if (this._setBackgroundColourOption("resizeBackground", a.background), n.defined(a.kernel)) if (n.string(c[a.kernel])) this.options.kernel = c[a.kernel];
			else throw n.invalidParameterError("kernel", "valid kernel name", a.kernel);
			n.defined(a.withoutEnlargement) && this._setBooleanOption("withoutEnlargement", a.withoutEnlargement), n.defined(a.withoutReduction) && this._setBooleanOption("withoutReduction", a.withoutReduction), n.defined(a.fastShrinkOnLoad) && this._setBooleanOption("fastShrinkOnLoad", a.fastShrinkOnLoad);
		}
		return d(this.options) && f(this.options) && (this.options.rotateBefore = !0), this;
	}
	function m(e) {
		if (n.integer(e) && e > 0) this.options.extendTop = e, this.options.extendBottom = e, this.options.extendLeft = e, this.options.extendRight = e;
		else if (n.object(e)) {
			if (n.defined(e.top)) if (n.integer(e.top) && e.top >= 0) this.options.extendTop = e.top;
			else throw n.invalidParameterError("top", "positive integer", e.top);
			if (n.defined(e.bottom)) if (n.integer(e.bottom) && e.bottom >= 0) this.options.extendBottom = e.bottom;
			else throw n.invalidParameterError("bottom", "positive integer", e.bottom);
			if (n.defined(e.left)) if (n.integer(e.left) && e.left >= 0) this.options.extendLeft = e.left;
			else throw n.invalidParameterError("left", "positive integer", e.left);
			if (n.defined(e.right)) if (n.integer(e.right) && e.right >= 0) this.options.extendRight = e.right;
			else throw n.invalidParameterError("right", "positive integer", e.right);
			if (this._setBackgroundColourOption("extendBackground", e.background), n.defined(e.extendWith)) if (n.string(o[e.extendWith])) this.options.extendWith = o[e.extendWith];
			else throw n.invalidParameterError("extendWith", "one of: background, copy, repeat, mirror", e.extendWith);
		} else throw n.invalidParameterError("extend", "integer or object", e);
		return this;
	}
	function h(e) {
		let t = f(this.options) || this.options.widthPre !== -1 ? "Post" : "Pre";
		return this.options[`width${t}`] !== -1 && this.options.debuglog("ignoring previous extract options"), [
			"left",
			"top",
			"width",
			"height"
		].forEach(function(r) {
			let i = e[r];
			if (n.integer(i) && i >= 0) this.options[r + (r === "left" || r === "top" ? "Offset" : "") + t] = i;
			else throw n.invalidParameterError(r, "integer", i);
		}, this), d(this.options) && !f(this.options) && (this.options.widthPre === -1 || this.options.widthPost === -1) && (this.options.rotateBefore = !0), this.options.input.autoOrient && (this.options.orientBefore = !0), this;
	}
	function g(e) {
		if (this.options.trimThreshold = 10, n.defined(e)) if (n.object(e)) {
			if (n.defined(e.background) && this._setBackgroundColourOption("trimBackground", e.background), n.defined(e.threshold)) if (n.number(e.threshold) && e.threshold >= 0) this.options.trimThreshold = e.threshold;
			else throw n.invalidParameterError("threshold", "positive number", e.threshold);
			n.defined(e.lineArt) && this._setBooleanOption("trimLineArt", e.lineArt);
		} else throw n.invalidParameterError("trim", "object", e);
		return d(this.options) && (this.options.rotateBefore = !0), this;
	}
	t.exports = (e) => {
		Object.assign(e.prototype, {
			resize: p,
			extend: m,
			extract: h,
			trim: g
		}), e.gravity = r, e.strategy = s, e.kernel = c, e.fit = l, e.position = i;
	};
})), ie = /* @__PURE__ */ i(((e, t) => {
	var n = a(), r = {
		clear: "clear",
		source: "source",
		over: "over",
		in: "in",
		out: "out",
		atop: "atop",
		dest: "dest",
		"dest-over": "dest-over",
		"dest-in": "dest-in",
		"dest-out": "dest-out",
		"dest-atop": "dest-atop",
		xor: "xor",
		add: "add",
		saturate: "saturate",
		multiply: "multiply",
		screen: "screen",
		overlay: "overlay",
		darken: "darken",
		lighten: "lighten",
		"colour-dodge": "colour-dodge",
		"color-dodge": "colour-dodge",
		"colour-burn": "colour-burn",
		"color-burn": "colour-burn",
		"hard-light": "hard-light",
		"soft-light": "soft-light",
		difference: "difference",
		exclusion: "exclusion"
	};
	function i(e) {
		if (!Array.isArray(e)) throw n.invalidParameterError("images to composite", "array", e);
		return this.options.composite = e.map((e) => {
			if (!n.object(e)) throw n.invalidParameterError("image to composite", "object", e);
			let t = this._inputOptionsFromObject(e), i = {
				input: this._createInputDescriptor(e.input, t, { allowStream: !1 }),
				blend: "over",
				tile: !1,
				left: 0,
				top: 0,
				hasOffset: !1,
				gravity: 0,
				premultiplied: !1
			};
			if (n.defined(e.blend)) if (n.string(r[e.blend])) i.blend = r[e.blend];
			else throw n.invalidParameterError("blend", "valid blend name", e.blend);
			if (n.defined(e.tile)) if (n.bool(e.tile)) i.tile = e.tile;
			else throw n.invalidParameterError("tile", "boolean", e.tile);
			if (n.defined(e.left)) if (n.integer(e.left)) i.left = e.left;
			else throw n.invalidParameterError("left", "integer", e.left);
			if (n.defined(e.top)) if (n.integer(e.top)) i.top = e.top;
			else throw n.invalidParameterError("top", "integer", e.top);
			if (n.defined(e.top) !== n.defined(e.left)) throw Error("Expected both left and top to be set");
			if (i.hasOffset = n.integer(e.top) && n.integer(e.left), n.defined(e.gravity)) if (n.integer(e.gravity) && n.inRange(e.gravity, 0, 8)) i.gravity = e.gravity;
			else if (n.string(e.gravity) && n.integer(this.constructor.gravity[e.gravity])) i.gravity = this.constructor.gravity[e.gravity];
			else throw n.invalidParameterError("gravity", "valid gravity", e.gravity);
			if (n.defined(e.premultiplied)) if (n.bool(e.premultiplied)) i.premultiplied = e.premultiplied;
			else throw n.invalidParameterError("premultiplied", "boolean", e.premultiplied);
			return i;
		}), this;
	}
	t.exports = (e) => {
		e.prototype.composite = i, e.blend = r;
	};
})), ae = /* @__PURE__ */ i(((e, t) => {
	var n = a(), r = {
		integer: "integer",
		float: "float",
		approximate: "approximate"
	};
	function i(e, t) {
		if (!n.defined(e)) return this.autoOrient();
		if ((this.options.angle || this.options.rotationAngle) && (this.options.debuglog("ignoring previous rotate options"), this.options.angle = 0, this.options.rotationAngle = 0), n.integer(e) && !(e % 90)) this.options.angle = e;
		else if (n.number(e)) this.options.rotationAngle = e, n.object(t) && t.background && this._setBackgroundColourOption("rotationBackground", t.background);
		else throw n.invalidParameterError("angle", "numeric", e);
		return this;
	}
	function o() {
		return this.options.input.autoOrient = !0, this;
	}
	function s(e) {
		return this.options.flip = n.bool(e) ? e : !0, this;
	}
	function c(e) {
		return this.options.flop = n.bool(e) ? e : !0, this;
	}
	function l(e, t) {
		let r = [].concat(...e);
		if (r.length === 4 && r.every(n.number)) this.options.affineMatrix = r;
		else throw n.invalidParameterError("matrix", "1x4 or 2x2 array", e);
		if (n.defined(t)) if (n.object(t)) {
			if (this._setBackgroundColourOption("affineBackground", t.background), n.defined(t.idx)) if (n.number(t.idx)) this.options.affineIdx = t.idx;
			else throw n.invalidParameterError("options.idx", "number", t.idx);
			if (n.defined(t.idy)) if (n.number(t.idy)) this.options.affineIdy = t.idy;
			else throw n.invalidParameterError("options.idy", "number", t.idy);
			if (n.defined(t.odx)) if (n.number(t.odx)) this.options.affineOdx = t.odx;
			else throw n.invalidParameterError("options.odx", "number", t.odx);
			if (n.defined(t.ody)) if (n.number(t.ody)) this.options.affineOdy = t.ody;
			else throw n.invalidParameterError("options.ody", "number", t.ody);
			if (n.defined(t.interpolator)) if (n.inArray(t.interpolator, Object.values(this.constructor.interpolators))) this.options.affineInterpolator = t.interpolator;
			else throw n.invalidParameterError("options.interpolator", "valid interpolator name", t.interpolator);
		} else throw n.invalidParameterError("options", "object", t);
		return this;
	}
	function u(e, t, r) {
		if (!n.defined(e)) this.options.sharpenSigma = -1;
		else if (n.bool(e)) this.options.sharpenSigma = e ? -1 : 0;
		else if (n.number(e) && n.inRange(e, .01, 1e4)) {
			if (this.options.sharpenSigma = e, n.defined(t)) if (n.number(t) && n.inRange(t, 0, 1e4)) this.options.sharpenM1 = t;
			else throw n.invalidParameterError("flat", "number between 0 and 10000", t);
			if (n.defined(r)) if (n.number(r) && n.inRange(r, 0, 1e4)) this.options.sharpenM2 = r;
			else throw n.invalidParameterError("jagged", "number between 0 and 10000", r);
		} else if (n.plainObject(e)) {
			if (n.number(e.sigma) && n.inRange(e.sigma, 1e-6, 10)) this.options.sharpenSigma = e.sigma;
			else throw n.invalidParameterError("options.sigma", "number between 0.000001 and 10", e.sigma);
			if (n.defined(e.m1)) if (n.number(e.m1) && n.inRange(e.m1, 0, 1e6)) this.options.sharpenM1 = e.m1;
			else throw n.invalidParameterError("options.m1", "number between 0 and 1000000", e.m1);
			if (n.defined(e.m2)) if (n.number(e.m2) && n.inRange(e.m2, 0, 1e6)) this.options.sharpenM2 = e.m2;
			else throw n.invalidParameterError("options.m2", "number between 0 and 1000000", e.m2);
			if (n.defined(e.x1)) if (n.number(e.x1) && n.inRange(e.x1, 0, 1e6)) this.options.sharpenX1 = e.x1;
			else throw n.invalidParameterError("options.x1", "number between 0 and 1000000", e.x1);
			if (n.defined(e.y2)) if (n.number(e.y2) && n.inRange(e.y2, 0, 1e6)) this.options.sharpenY2 = e.y2;
			else throw n.invalidParameterError("options.y2", "number between 0 and 1000000", e.y2);
			if (n.defined(e.y3)) if (n.number(e.y3) && n.inRange(e.y3, 0, 1e6)) this.options.sharpenY3 = e.y3;
			else throw n.invalidParameterError("options.y3", "number between 0 and 1000000", e.y3);
		} else throw n.invalidParameterError("sigma", "number between 0.01 and 10000", e);
		return this;
	}
	function d(e) {
		if (!n.defined(e)) this.options.medianSize = 3;
		else if (n.integer(e) && n.inRange(e, 1, 1e3)) this.options.medianSize = e;
		else throw n.invalidParameterError("size", "integer between 1 and 1000", e);
		return this;
	}
	function f(e) {
		let t;
		if (n.number(e)) t = e;
		else if (n.plainObject(e)) {
			if (!n.number(e.sigma)) throw n.invalidParameterError("options.sigma", "number between 0.3 and 1000", t);
			if (t = e.sigma, "precision" in e) if (n.string(r[e.precision])) this.options.precision = r[e.precision];
			else throw n.invalidParameterError("precision", "one of: integer, float, approximate", e.precision);
			if ("minAmplitude" in e) if (n.number(e.minAmplitude) && n.inRange(e.minAmplitude, .001, 1)) this.options.minAmpl = e.minAmplitude;
			else throw n.invalidParameterError("minAmplitude", "number between 0.001 and 1", e.minAmplitude);
		}
		if (!n.defined(e)) this.options.blurSigma = -1;
		else if (n.bool(e)) this.options.blurSigma = e ? -1 : 0;
		else if (n.number(t) && n.inRange(t, .3, 1e3)) this.options.blurSigma = t;
		else throw n.invalidParameterError("sigma", "number between 0.3 and 1000", t);
		return this;
	}
	function p(e) {
		if (!n.defined(e)) this.options.dilateWidth = 1;
		else if (n.integer(e) && e > 0) this.options.dilateWidth = e;
		else throw n.invalidParameterError("dilate", "positive integer", p);
		return this;
	}
	function m(e) {
		if (!n.defined(e)) this.options.erodeWidth = 1;
		else if (n.integer(e) && e > 0) this.options.erodeWidth = e;
		else throw n.invalidParameterError("erode", "positive integer", m);
		return this;
	}
	function h(e) {
		return this.options.flatten = n.bool(e) ? e : !0, n.object(e) && this._setBackgroundColourOption("flattenBackground", e.background), this;
	}
	function g() {
		return this.options.unflatten = !0, this;
	}
	function _(e, t) {
		if (!n.defined(e)) this.options.gamma = 2.2;
		else if (n.number(e) && n.inRange(e, 1, 3)) this.options.gamma = e;
		else throw n.invalidParameterError("gamma", "number between 1.0 and 3.0", e);
		if (!n.defined(t)) this.options.gammaOut = this.options.gamma;
		else if (n.number(t) && n.inRange(t, 1, 3)) this.options.gammaOut = t;
		else throw n.invalidParameterError("gammaOut", "number between 1.0 and 3.0", t);
		return this;
	}
	function v(e) {
		if (this.options.negate = n.bool(e) ? e : !0, n.plainObject(e) && "alpha" in e) if (n.bool(e.alpha)) this.options.negateAlpha = e.alpha;
		else throw n.invalidParameterError("alpha", "should be boolean value", e.alpha);
		return this;
	}
	function y(e) {
		if (n.plainObject(e)) {
			if (n.defined(e.lower)) if (n.number(e.lower) && n.inRange(e.lower, 0, 99)) this.options.normaliseLower = e.lower;
			else throw n.invalidParameterError("lower", "number between 0 and 99", e.lower);
			if (n.defined(e.upper)) if (n.number(e.upper) && n.inRange(e.upper, 1, 100)) this.options.normaliseUpper = e.upper;
			else throw n.invalidParameterError("upper", "number between 1 and 100", e.upper);
		}
		if (this.options.normaliseLower >= this.options.normaliseUpper) throw n.invalidParameterError("range", "lower to be less than upper", `${this.options.normaliseLower} >= ${this.options.normaliseUpper}`);
		return this.options.normalise = !0, this;
	}
	function b(e) {
		return this.normalise(e);
	}
	function x(e) {
		if (n.plainObject(e)) {
			if (n.integer(e.width) && e.width > 0) this.options.claheWidth = e.width;
			else throw n.invalidParameterError("width", "integer greater than zero", e.width);
			if (n.integer(e.height) && e.height > 0) this.options.claheHeight = e.height;
			else throw n.invalidParameterError("height", "integer greater than zero", e.height);
			if (n.defined(e.maxSlope)) if (n.integer(e.maxSlope) && n.inRange(e.maxSlope, 0, 100)) this.options.claheMaxSlope = e.maxSlope;
			else throw n.invalidParameterError("maxSlope", "integer between 0 and 100", e.maxSlope);
		} else throw n.invalidParameterError("options", "plain object", e);
		return this;
	}
	function S(e) {
		if (!n.object(e) || !Array.isArray(e.kernel) || !n.integer(e.width) || !n.integer(e.height) || !n.inRange(e.width, 3, 1001) || !n.inRange(e.height, 3, 1001) || e.height * e.width !== e.kernel.length) throw Error("Invalid convolution kernel");
		return n.integer(e.scale) || (e.scale = e.kernel.reduce((e, t) => e + t, 0)), e.scale < 1 && (e.scale = 1), n.integer(e.offset) || (e.offset = 0), this.options.convKernel = e, this;
	}
	function C(e, t) {
		if (!n.defined(e)) this.options.threshold = 128;
		else if (n.bool(e)) this.options.threshold = e ? 128 : 0;
		else if (n.integer(e) && n.inRange(e, 0, 255)) this.options.threshold = e;
		else throw n.invalidParameterError("threshold", "integer between 0 and 255", e);
		return !n.object(t) || t.greyscale === !0 || t.grayscale === !0 ? this.options.thresholdGrayscale = !0 : this.options.thresholdGrayscale = !1, this;
	}
	function w(e, t, r) {
		if (this.options.boolean = this._createInputDescriptor(e, r), n.string(t) && n.inArray(t, [
			"and",
			"or",
			"eor"
		])) this.options.booleanOp = t;
		else throw n.invalidParameterError("operator", "one of: and, or, eor", t);
		return this;
	}
	function T(e, t) {
		if (!n.defined(e) && n.number(t) ? e = 1 : n.number(e) && !n.defined(t) && (t = 0), !n.defined(e)) this.options.linearA = [];
		else if (n.number(e)) this.options.linearA = [e];
		else if (Array.isArray(e) && e.length && e.every(n.number)) this.options.linearA = e;
		else throw n.invalidParameterError("a", "number or array of numbers", e);
		if (!n.defined(t)) this.options.linearB = [];
		else if (n.number(t)) this.options.linearB = [t];
		else if (Array.isArray(t) && t.length && t.every(n.number)) this.options.linearB = t;
		else throw n.invalidParameterError("b", "number or array of numbers", t);
		if (this.options.linearA.length !== this.options.linearB.length) throw Error("Expected a and b to be arrays of the same length");
		return this;
	}
	function E(e) {
		if (!Array.isArray(e)) throw n.invalidParameterError("inputMatrix", "array", e);
		if (e.length !== 3 && e.length !== 4) throw n.invalidParameterError("inputMatrix", "3x3 or 4x4 array", e.length);
		let t = e.flat().map(Number);
		if (t.length !== 9 && t.length !== 16) throw n.invalidParameterError("inputMatrix", "cardinality of 9 or 16", t.length);
		return this.options.recombMatrix = t, this;
	}
	function D(e) {
		if (!n.plainObject(e)) throw n.invalidParameterError("options", "plain object", e);
		if ("brightness" in e) if (n.number(e.brightness) && e.brightness >= 0) this.options.brightness = e.brightness;
		else throw n.invalidParameterError("brightness", "number above zero", e.brightness);
		if ("saturation" in e) if (n.number(e.saturation) && e.saturation >= 0) this.options.saturation = e.saturation;
		else throw n.invalidParameterError("saturation", "number above zero", e.saturation);
		if ("hue" in e) if (n.integer(e.hue)) this.options.hue = e.hue % 360;
		else throw n.invalidParameterError("hue", "number", e.hue);
		if ("lightness" in e) if (n.number(e.lightness)) this.options.lightness = e.lightness;
		else throw n.invalidParameterError("lightness", "number", e.lightness);
		return this;
	}
	t.exports = (e) => {
		Object.assign(e.prototype, {
			autoOrient: o,
			rotate: i,
			flip: s,
			flop: c,
			affine: l,
			sharpen: u,
			erode: m,
			dilate: p,
			median: d,
			blur: f,
			flatten: h,
			unflatten: g,
			gamma: _,
			negate: v,
			normalise: y,
			normalize: b,
			clahe: x,
			convolve: S,
			threshold: C,
			boolean: w,
			linear: T,
			recomb: E,
			modulate: D
		});
	};
})), oe = /* @__PURE__ */ i(((e, t) => {
	var n = Object.defineProperty, r = Object.getOwnPropertyDescriptor, i = Object.getOwnPropertyNames, a = Object.prototype.hasOwnProperty, o = (e, t) => {
		for (var r in t) n(e, r, {
			get: t[r],
			enumerable: !0
		});
	}, s = (e, t, o, s) => {
		if (t && typeof t == "object" || typeof t == "function") for (let c of i(t)) !a.call(e, c) && c !== o && n(e, c, {
			get: () => t[c],
			enumerable: !(s = r(t, c)) || s.enumerable
		});
		return e;
	}, c = (e) => s(n({}, "__esModule", { value: !0 }), e), l = {};
	o(l, { default: () => G }), t.exports = c(l);
	var u = {
		aliceblue: [
			240,
			248,
			255
		],
		antiquewhite: [
			250,
			235,
			215
		],
		aqua: [
			0,
			255,
			255
		],
		aquamarine: [
			127,
			255,
			212
		],
		azure: [
			240,
			255,
			255
		],
		beige: [
			245,
			245,
			220
		],
		bisque: [
			255,
			228,
			196
		],
		black: [
			0,
			0,
			0
		],
		blanchedalmond: [
			255,
			235,
			205
		],
		blue: [
			0,
			0,
			255
		],
		blueviolet: [
			138,
			43,
			226
		],
		brown: [
			165,
			42,
			42
		],
		burlywood: [
			222,
			184,
			135
		],
		cadetblue: [
			95,
			158,
			160
		],
		chartreuse: [
			127,
			255,
			0
		],
		chocolate: [
			210,
			105,
			30
		],
		coral: [
			255,
			127,
			80
		],
		cornflowerblue: [
			100,
			149,
			237
		],
		cornsilk: [
			255,
			248,
			220
		],
		crimson: [
			220,
			20,
			60
		],
		cyan: [
			0,
			255,
			255
		],
		darkblue: [
			0,
			0,
			139
		],
		darkcyan: [
			0,
			139,
			139
		],
		darkgoldenrod: [
			184,
			134,
			11
		],
		darkgray: [
			169,
			169,
			169
		],
		darkgreen: [
			0,
			100,
			0
		],
		darkgrey: [
			169,
			169,
			169
		],
		darkkhaki: [
			189,
			183,
			107
		],
		darkmagenta: [
			139,
			0,
			139
		],
		darkolivegreen: [
			85,
			107,
			47
		],
		darkorange: [
			255,
			140,
			0
		],
		darkorchid: [
			153,
			50,
			204
		],
		darkred: [
			139,
			0,
			0
		],
		darksalmon: [
			233,
			150,
			122
		],
		darkseagreen: [
			143,
			188,
			143
		],
		darkslateblue: [
			72,
			61,
			139
		],
		darkslategray: [
			47,
			79,
			79
		],
		darkslategrey: [
			47,
			79,
			79
		],
		darkturquoise: [
			0,
			206,
			209
		],
		darkviolet: [
			148,
			0,
			211
		],
		deeppink: [
			255,
			20,
			147
		],
		deepskyblue: [
			0,
			191,
			255
		],
		dimgray: [
			105,
			105,
			105
		],
		dimgrey: [
			105,
			105,
			105
		],
		dodgerblue: [
			30,
			144,
			255
		],
		firebrick: [
			178,
			34,
			34
		],
		floralwhite: [
			255,
			250,
			240
		],
		forestgreen: [
			34,
			139,
			34
		],
		fuchsia: [
			255,
			0,
			255
		],
		gainsboro: [
			220,
			220,
			220
		],
		ghostwhite: [
			248,
			248,
			255
		],
		gold: [
			255,
			215,
			0
		],
		goldenrod: [
			218,
			165,
			32
		],
		gray: [
			128,
			128,
			128
		],
		green: [
			0,
			128,
			0
		],
		greenyellow: [
			173,
			255,
			47
		],
		grey: [
			128,
			128,
			128
		],
		honeydew: [
			240,
			255,
			240
		],
		hotpink: [
			255,
			105,
			180
		],
		indianred: [
			205,
			92,
			92
		],
		indigo: [
			75,
			0,
			130
		],
		ivory: [
			255,
			255,
			240
		],
		khaki: [
			240,
			230,
			140
		],
		lavender: [
			230,
			230,
			250
		],
		lavenderblush: [
			255,
			240,
			245
		],
		lawngreen: [
			124,
			252,
			0
		],
		lemonchiffon: [
			255,
			250,
			205
		],
		lightblue: [
			173,
			216,
			230
		],
		lightcoral: [
			240,
			128,
			128
		],
		lightcyan: [
			224,
			255,
			255
		],
		lightgoldenrodyellow: [
			250,
			250,
			210
		],
		lightgray: [
			211,
			211,
			211
		],
		lightgreen: [
			144,
			238,
			144
		],
		lightgrey: [
			211,
			211,
			211
		],
		lightpink: [
			255,
			182,
			193
		],
		lightsalmon: [
			255,
			160,
			122
		],
		lightseagreen: [
			32,
			178,
			170
		],
		lightskyblue: [
			135,
			206,
			250
		],
		lightslategray: [
			119,
			136,
			153
		],
		lightslategrey: [
			119,
			136,
			153
		],
		lightsteelblue: [
			176,
			196,
			222
		],
		lightyellow: [
			255,
			255,
			224
		],
		lime: [
			0,
			255,
			0
		],
		limegreen: [
			50,
			205,
			50
		],
		linen: [
			250,
			240,
			230
		],
		magenta: [
			255,
			0,
			255
		],
		maroon: [
			128,
			0,
			0
		],
		mediumaquamarine: [
			102,
			205,
			170
		],
		mediumblue: [
			0,
			0,
			205
		],
		mediumorchid: [
			186,
			85,
			211
		],
		mediumpurple: [
			147,
			112,
			219
		],
		mediumseagreen: [
			60,
			179,
			113
		],
		mediumslateblue: [
			123,
			104,
			238
		],
		mediumspringgreen: [
			0,
			250,
			154
		],
		mediumturquoise: [
			72,
			209,
			204
		],
		mediumvioletred: [
			199,
			21,
			133
		],
		midnightblue: [
			25,
			25,
			112
		],
		mintcream: [
			245,
			255,
			250
		],
		mistyrose: [
			255,
			228,
			225
		],
		moccasin: [
			255,
			228,
			181
		],
		navajowhite: [
			255,
			222,
			173
		],
		navy: [
			0,
			0,
			128
		],
		oldlace: [
			253,
			245,
			230
		],
		olive: [
			128,
			128,
			0
		],
		olivedrab: [
			107,
			142,
			35
		],
		orange: [
			255,
			165,
			0
		],
		orangered: [
			255,
			69,
			0
		],
		orchid: [
			218,
			112,
			214
		],
		palegoldenrod: [
			238,
			232,
			170
		],
		palegreen: [
			152,
			251,
			152
		],
		paleturquoise: [
			175,
			238,
			238
		],
		palevioletred: [
			219,
			112,
			147
		],
		papayawhip: [
			255,
			239,
			213
		],
		peachpuff: [
			255,
			218,
			185
		],
		peru: [
			205,
			133,
			63
		],
		pink: [
			255,
			192,
			203
		],
		plum: [
			221,
			160,
			221
		],
		powderblue: [
			176,
			224,
			230
		],
		purple: [
			128,
			0,
			128
		],
		rebeccapurple: [
			102,
			51,
			153
		],
		red: [
			255,
			0,
			0
		],
		rosybrown: [
			188,
			143,
			143
		],
		royalblue: [
			65,
			105,
			225
		],
		saddlebrown: [
			139,
			69,
			19
		],
		salmon: [
			250,
			128,
			114
		],
		sandybrown: [
			244,
			164,
			96
		],
		seagreen: [
			46,
			139,
			87
		],
		seashell: [
			255,
			245,
			238
		],
		sienna: [
			160,
			82,
			45
		],
		silver: [
			192,
			192,
			192
		],
		skyblue: [
			135,
			206,
			235
		],
		slateblue: [
			106,
			90,
			205
		],
		slategray: [
			112,
			128,
			144
		],
		slategrey: [
			112,
			128,
			144
		],
		snow: [
			255,
			250,
			250
		],
		springgreen: [
			0,
			255,
			127
		],
		steelblue: [
			70,
			130,
			180
		],
		tan: [
			210,
			180,
			140
		],
		teal: [
			0,
			128,
			128
		],
		thistle: [
			216,
			191,
			216
		],
		tomato: [
			255,
			99,
			71
		],
		turquoise: [
			64,
			224,
			208
		],
		violet: [
			238,
			130,
			238
		],
		wheat: [
			245,
			222,
			179
		],
		white: [
			255,
			255,
			255
		],
		whitesmoke: [
			245,
			245,
			245
		],
		yellow: [
			255,
			255,
			0
		],
		yellowgreen: [
			154,
			205,
			50
		]
	};
	for (let e in u) Object.freeze(u[e]);
	var d = Object.freeze(u), f = /* @__PURE__ */ Object.create(null);
	for (let e in d) Object.hasOwn(d, e) && (f[d[e]] = e);
	var p = {
		to: {},
		get: {}
	};
	p.get = function(e) {
		let t = e.slice(0, 3).toLowerCase(), n, r;
		switch (t) {
			case "hsl":
				n = p.get.hsl(e), r = "hsl";
				break;
			case "hwb":
				n = p.get.hwb(e), r = "hwb";
				break;
			default:
				n = p.get.rgb(e), r = "rgb";
				break;
		}
		return n ? {
			model: r,
			value: n
		} : null;
	}, p.get.rgb = function(e) {
		if (!e) return null;
		let t = /^#([a-f\d]{3,4})$/i, n = /^#([a-f\d]{6})([a-f\d]{2})?$/i, r = /^rgba?\(\s*([+-]?(?:\d*\.)?\d+(?:e\d+)?)(?=[\s,])\s*(?:,\s*)?([+-]?(?:\d*\.)?\d+(?:e\d+)?)(?=[\s,])\s*(?:,\s*)?([+-]?(?:\d*\.)?\d+(?:e\d+)?)\s*(?:[\s,|/]\s*([+-]?(?:\d*\.)?\d+(?:e\d+)?)(%?)\s*)?\)$/i, i = /^rgba?\(\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*(?:[\s,|/]\s*([+-]?[\d.]+)(%?)\s*)?\)$/i, a = /^(\w+)$/, o = [
			0,
			0,
			0,
			1
		], s, c, l;
		if (s = e.match(n)) {
			for (l = s[2], s = s[1], c = 0; c < 3; c++) {
				let e = c * 2;
				o[c] = Number.parseInt(s.slice(e, e + 2), 16);
			}
			l && (o[3] = Number.parseInt(l, 16) / 255);
		} else if (s = e.match(t)) {
			for (s = s[1], l = s[3], c = 0; c < 3; c++) o[c] = Number.parseInt(s[c] + s[c], 16);
			l && (o[3] = Number.parseInt(l + l, 16) / 255);
		} else if (s = e.match(r)) {
			for (c = 0; c < 3; c++) o[c] = Number.parseFloat(s[c + 1]);
			s[4] && (o[3] = s[5] ? Number.parseFloat(s[4]) * .01 : Number.parseFloat(s[4]));
		} else if (s = e.match(i)) {
			for (c = 0; c < 3; c++) o[c] = Math.round(Number.parseFloat(s[c + 1]) * 2.55);
			s[4] && (o[3] = s[5] ? Number.parseFloat(s[4]) * .01 : Number.parseFloat(s[4]));
		} else if (s = e.toLowerCase().match(a)) return s[1] === "transparent" ? [
			0,
			0,
			0,
			0
		] : Object.hasOwn(d, s[1]) ? (o = d[s[1]].slice(), o[3] = 1, o) : null;
		else return null;
		for (c = 0; c < 3; c++) o[c] = m(o[c], 0, 255);
		return o[3] = m(o[3], 0, 1), o;
	}, p.get.hsl = function(e) {
		if (!e) return null;
		let t = e.match(/^hsla?\(\s*([+-]?(?:\d{0,3}\.)?\d+)(?:deg)?\s*,?\s*([+-]?[\d.]+)%\s*,?\s*([+-]?[\d.]+)%\s*(?:[,|/]\s*([+-]?(?=\.\d|\d)(?:0|[1-9]\d*)?(?:\.\d*)?(?:e[+-]?\d+)?)\s*)?\)$/i);
		if (t) {
			let e = Number.parseFloat(t[4]);
			return [
				(Number.parseFloat(t[1]) % 360 + 360) % 360,
				m(Number.parseFloat(t[2]), 0, 100),
				m(Number.parseFloat(t[3]), 0, 100),
				m(Number.isNaN(e) ? 1 : e, 0, 1)
			];
		}
		return null;
	}, p.get.hwb = function(e) {
		if (!e) return null;
		let t = e.match(/^hwb\(\s*([+-]?\d{0,3}(?:\.\d+)?)(?:deg)?\s*[\s,]\s*([+-]?[\d.]+)%\s*[\s,]\s*([+-]?[\d.]+)%\s*(?:[\s,]\s*([+-]?(?=\.\d|\d)(?:0|[1-9]\d*)?(?:\.\d*)?(?:e[+-]?\d+)?)\s*)?\)$/i);
		if (t) {
			let e = Number.parseFloat(t[4]);
			return [
				(Number.parseFloat(t[1]) % 360 + 360) % 360,
				m(Number.parseFloat(t[2]), 0, 100),
				m(Number.parseFloat(t[3]), 0, 100),
				m(Number.isNaN(e) ? 1 : e, 0, 1)
			];
		}
		return null;
	}, p.to.hex = function(...e) {
		return "#" + h(e[0]) + h(e[1]) + h(e[2]) + (e[3] < 1 ? h(Math.round(e[3] * 255)) : "");
	}, p.to.rgb = function(...e) {
		return e.length < 4 || e[3] === 1 ? "rgb(" + Math.round(e[0]) + ", " + Math.round(e[1]) + ", " + Math.round(e[2]) + ")" : "rgba(" + Math.round(e[0]) + ", " + Math.round(e[1]) + ", " + Math.round(e[2]) + ", " + e[3] + ")";
	}, p.to.rgb.percent = function(...e) {
		let t = Math.round(e[0] / 255 * 100), n = Math.round(e[1] / 255 * 100), r = Math.round(e[2] / 255 * 100);
		return e.length < 4 || e[3] === 1 ? "rgb(" + t + "%, " + n + "%, " + r + "%)" : "rgba(" + t + "%, " + n + "%, " + r + "%, " + e[3] + ")";
	}, p.to.hsl = function(...e) {
		return e.length < 4 || e[3] === 1 ? "hsl(" + e[0] + ", " + e[1] + "%, " + e[2] + "%)" : "hsla(" + e[0] + ", " + e[1] + "%, " + e[2] + "%, " + e[3] + ")";
	}, p.to.hwb = function(...e) {
		let t = "";
		return e.length >= 4 && e[3] !== 1 && (t = ", " + e[3]), "hwb(" + e[0] + ", " + e[1] + "%, " + e[2] + "%" + t + ")";
	}, p.to.keyword = function(...e) {
		return f[e.slice(0, 3)];
	};
	function m(e, t, n) {
		return Math.min(Math.max(t, e), n);
	}
	function h(e) {
		let t = Math.round(e).toString(16).toUpperCase();
		return t.length < 2 ? "0" + t : t;
	}
	var g = p, _ = {};
	for (let e of Object.keys(d)) _[d[e]] = e;
	var v = {
		rgb: {
			channels: 3,
			labels: "rgb"
		},
		hsl: {
			channels: 3,
			labels: "hsl"
		},
		hsv: {
			channels: 3,
			labels: "hsv"
		},
		hwb: {
			channels: 3,
			labels: "hwb"
		},
		cmyk: {
			channels: 4,
			labels: "cmyk"
		},
		xyz: {
			channels: 3,
			labels: "xyz"
		},
		lab: {
			channels: 3,
			labels: "lab"
		},
		oklab: {
			channels: 3,
			labels: [
				"okl",
				"oka",
				"okb"
			]
		},
		lch: {
			channels: 3,
			labels: "lch"
		},
		oklch: {
			channels: 3,
			labels: [
				"okl",
				"okc",
				"okh"
			]
		},
		hex: {
			channels: 1,
			labels: ["hex"]
		},
		keyword: {
			channels: 1,
			labels: ["keyword"]
		},
		ansi16: {
			channels: 1,
			labels: ["ansi16"]
		},
		ansi256: {
			channels: 1,
			labels: ["ansi256"]
		},
		hcg: {
			channels: 3,
			labels: [
				"h",
				"c",
				"g"
			]
		},
		apple: {
			channels: 3,
			labels: [
				"r16",
				"g16",
				"b16"
			]
		},
		gray: {
			channels: 1,
			labels: ["gray"]
		}
	}, y = v, b = (6 / 29) ** 3;
	function x(e) {
		let t = e > .0031308 ? 1.055 * e ** (1 / 2.4) - .055 : e * 12.92;
		return Math.min(Math.max(0, t), 1);
	}
	function S(e) {
		return e > .04045 ? ((e + .055) / 1.055) ** 2.4 : e / 12.92;
	}
	for (let e of Object.keys(v)) {
		if (!("channels" in v[e])) throw Error("missing channels property: " + e);
		if (!("labels" in v[e])) throw Error("missing channel labels property: " + e);
		if (v[e].labels.length !== v[e].channels) throw Error("channel and label counts mismatch: " + e);
		let { channels: t, labels: n } = v[e];
		delete v[e].channels, delete v[e].labels, Object.defineProperty(v[e], "channels", { value: t }), Object.defineProperty(v[e], "labels", { value: n });
	}
	v.rgb.hsl = function(e) {
		let t = e[0] / 255, n = e[1] / 255, r = e[2] / 255, i = Math.min(t, n, r), a = Math.max(t, n, r), o = a - i, s, c;
		switch (a) {
			case i:
				s = 0;
				break;
			case t:
				s = (n - r) / o;
				break;
			case n:
				s = 2 + (r - t) / o;
				break;
			case r:
				s = 4 + (t - n) / o;
				break;
		}
		s = Math.min(s * 60, 360), s < 0 && (s += 360);
		let l = (i + a) / 2;
		return c = a === i ? 0 : l <= .5 ? o / (a + i) : o / (2 - a - i), [
			s,
			c * 100,
			l * 100
		];
	}, v.rgb.hsv = function(e) {
		let t, n, r, i, a, o = e[0] / 255, s = e[1] / 255, c = e[2] / 255, l = Math.max(o, s, c), u = l - Math.min(o, s, c), d = function(e) {
			return (l - e) / 6 / u + 1 / 2;
		};
		if (u === 0) i = 0, a = 0;
		else {
			switch (a = u / l, t = d(o), n = d(s), r = d(c), l) {
				case o:
					i = r - n;
					break;
				case s:
					i = 1 / 3 + t - r;
					break;
				case c:
					i = 2 / 3 + n - t;
					break;
			}
			i < 0 ? i += 1 : i > 1 && --i;
		}
		return [
			i * 360,
			a * 100,
			l * 100
		];
	}, v.rgb.hwb = function(e) {
		let t = e[0], n = e[1], r = e[2], i = v.rgb.hsl(e)[0], a = 1 / 255 * Math.min(t, Math.min(n, r));
		return r = 1 - 1 / 255 * Math.max(t, Math.max(n, r)), [
			i,
			a * 100,
			r * 100
		];
	}, v.rgb.oklab = function(e) {
		let t = S(e[0] / 255), n = S(e[1] / 255), r = S(e[2] / 255), i = Math.cbrt(.4122214708 * t + .5363325363 * n + .0514459929 * r), a = Math.cbrt(.2119034982 * t + .6806995451 * n + .1073969566 * r), o = Math.cbrt(.0883024619 * t + .2817188376 * n + .6299787005 * r), s = .2104542553 * i + .793617785 * a - .0040720468 * o, c = 1.9779984951 * i - 2.428592205 * a + .4505937099 * o, l = .0259040371 * i + .7827717662 * a - .808675766 * o;
		return [
			s * 100,
			c * 100,
			l * 100
		];
	}, v.rgb.cmyk = function(e) {
		let t = e[0] / 255, n = e[1] / 255, r = e[2] / 255, i = Math.min(1 - t, 1 - n, 1 - r), a = (1 - t - i) / (1 - i) || 0, o = (1 - n - i) / (1 - i) || 0, s = (1 - r - i) / (1 - i) || 0;
		return [
			a * 100,
			o * 100,
			s * 100,
			i * 100
		];
	};
	function C(e, t) {
		return (e[0] - t[0]) ** 2 + (e[1] - t[1]) ** 2 + (e[2] - t[2]) ** 2;
	}
	v.rgb.keyword = function(e) {
		let t = _[e];
		if (t) return t;
		let n = Infinity, r;
		for (let t of Object.keys(d)) {
			let i = d[t], a = C(e, i);
			a < n && (n = a, r = t);
		}
		return r;
	}, v.keyword.rgb = function(e) {
		return [...d[e]];
	}, v.rgb.xyz = function(e) {
		let t = S(e[0] / 255), n = S(e[1] / 255), r = S(e[2] / 255), i = t * .4124564 + n * .3575761 + r * .1804375, a = t * .2126729 + n * .7151522 + r * .072175, o = t * .0193339 + n * .119192 + r * .9503041;
		return [
			i * 100,
			a * 100,
			o * 100
		];
	}, v.rgb.lab = function(e) {
		let t = v.rgb.xyz(e), n = t[0], r = t[1], i = t[2];
		return n /= 95.047, r /= 100, i /= 108.883, n = n > b ? n ** (1 / 3) : 7.787 * n + 16 / 116, r = r > b ? r ** (1 / 3) : 7.787 * r + 16 / 116, i = i > b ? i ** (1 / 3) : 7.787 * i + 16 / 116, [
			116 * r - 16,
			500 * (n - r),
			200 * (r - i)
		];
	}, v.hsl.rgb = function(e) {
		let t = e[0] / 360, n = e[1] / 100, r = e[2] / 100, i, a;
		if (n === 0) return a = r * 255, [
			a,
			a,
			a
		];
		let o = r < .5 ? r * (1 + n) : r + n - r * n, s = 2 * r - o, c = [
			0,
			0,
			0
		];
		for (let e = 0; e < 3; e++) i = t + 1 / 3 * -(e - 1), i < 0 && i++, i > 1 && i--, a = 6 * i < 1 ? s + (o - s) * 6 * i : 2 * i < 1 ? o : 3 * i < 2 ? s + (o - s) * (2 / 3 - i) * 6 : s, c[e] = a * 255;
		return c;
	}, v.hsl.hsv = function(e) {
		let t = e[0], n = e[1] / 100, r = e[2] / 100, i = n, a = Math.max(r, .01);
		r *= 2, n *= r <= 1 ? r : 2 - r, i *= a <= 1 ? a : 2 - a;
		let o = (r + n) / 2;
		return [
			t,
			(r === 0 ? 2 * i / (a + i) : 2 * n / (r + n)) * 100,
			o * 100
		];
	}, v.hsv.rgb = function(e) {
		let t = e[0] / 60, n = e[1] / 100, r = e[2] / 100, i = Math.floor(t) % 6, a = t - Math.floor(t), o = 255 * r * (1 - n), s = 255 * r * (1 - n * a), c = 255 * r * (1 - n * (1 - a));
		switch (r *= 255, i) {
			case 0: return [
				r,
				c,
				o
			];
			case 1: return [
				s,
				r,
				o
			];
			case 2: return [
				o,
				r,
				c
			];
			case 3: return [
				o,
				s,
				r
			];
			case 4: return [
				c,
				o,
				r
			];
			case 5: return [
				r,
				o,
				s
			];
		}
	}, v.hsv.hsl = function(e) {
		let t = e[0], n = e[1] / 100, r = e[2] / 100, i = Math.max(r, .01), a, o;
		o = (2 - n) * r;
		let s = (2 - n) * i;
		return a = n * i, a /= s <= 1 ? s : 2 - s, a ||= 0, o /= 2, [
			t,
			a * 100,
			o * 100
		];
	}, v.hwb.rgb = function(e) {
		let t = e[0] / 360, n = e[1] / 100, r = e[2] / 100, i = n + r, a;
		i > 1 && (n /= i, r /= i);
		let o = Math.floor(6 * t), s = 1 - r;
		a = 6 * t - o, o & 1 && (a = 1 - a);
		let c = n + a * (s - n), l, u, d;
		switch (o) {
			default:
			case 6:
			case 0:
				l = s, u = c, d = n;
				break;
			case 1:
				l = c, u = s, d = n;
				break;
			case 2:
				l = n, u = s, d = c;
				break;
			case 3:
				l = n, u = c, d = s;
				break;
			case 4:
				l = c, u = n, d = s;
				break;
			case 5:
				l = s, u = n, d = c;
				break;
		}
		return [
			l * 255,
			u * 255,
			d * 255
		];
	}, v.cmyk.rgb = function(e) {
		let t = e[0] / 100, n = e[1] / 100, r = e[2] / 100, i = e[3] / 100, a = 1 - Math.min(1, t * (1 - i) + i), o = 1 - Math.min(1, n * (1 - i) + i), s = 1 - Math.min(1, r * (1 - i) + i);
		return [
			a * 255,
			o * 255,
			s * 255
		];
	}, v.xyz.rgb = function(e) {
		let t = e[0] / 100, n = e[1] / 100, r = e[2] / 100, i, a, o;
		return i = t * 3.2404542 + n * -1.5371385 + r * -.4985314, a = t * -.969266 + n * 1.8760108 + r * .041556, o = t * .0556434 + n * -.2040259 + r * 1.0572252, i = x(i), a = x(a), o = x(o), [
			i * 255,
			a * 255,
			o * 255
		];
	}, v.xyz.lab = function(e) {
		let t = e[0], n = e[1], r = e[2];
		return t /= 95.047, n /= 100, r /= 108.883, t = t > b ? t ** (1 / 3) : 7.787 * t + 16 / 116, n = n > b ? n ** (1 / 3) : 7.787 * n + 16 / 116, r = r > b ? r ** (1 / 3) : 7.787 * r + 16 / 116, [
			116 * n - 16,
			500 * (t - n),
			200 * (n - r)
		];
	}, v.xyz.oklab = function(e) {
		let t = e[0] / 100, n = e[1] / 100, r = e[2] / 100, i = Math.cbrt(.8189330101 * t + .3618667424 * n - .1288597137 * r), a = Math.cbrt(.0329845436 * t + .9293118715 * n + .0361456387 * r), o = Math.cbrt(.0482003018 * t + .2643662691 * n + .633851707 * r), s = .2104542553 * i + .793617785 * a - .0040720468 * o, c = 1.9779984951 * i - 2.428592205 * a + .4505937099 * o, l = .0259040371 * i + .7827717662 * a - .808675766 * o;
		return [
			s * 100,
			c * 100,
			l * 100
		];
	}, v.oklab.oklch = function(e) {
		return v.lab.lch(e);
	}, v.oklab.xyz = function(e) {
		let t = e[0] / 100, n = e[1] / 100, r = e[2] / 100, i = (.999999998 * t + .396337792 * n + .215803758 * r) ** 3, a = (1.000000008 * t - .105561342 * n - .063854175 * r) ** 3, o = (1.000000055 * t - .089484182 * n - 1.291485538 * r) ** 3, s = 1.227013851 * i - .55779998 * a + .281256149 * o, c = -.040580178 * i + 1.11225687 * a - .071676679 * o, l = -.076381285 * i - .421481978 * a + 1.58616322 * o;
		return [
			s * 100,
			c * 100,
			l * 100
		];
	}, v.oklab.rgb = function(e) {
		let t = e[0] / 100, n = e[1] / 100, r = e[2] / 100, i = (t + .3963377774 * n + .2158037573 * r) ** 3, a = (t - .1055613458 * n - .0638541728 * r) ** 3, o = (t - .0894841775 * n - 1.291485548 * r) ** 3, s = x(4.0767416621 * i - 3.3077115913 * a + .2309699292 * o), c = x(-1.2684380046 * i + 2.6097574011 * a - .3413193965 * o), l = x(-.0041960863 * i - .7034186147 * a + 1.707614701 * o);
		return [
			s * 255,
			c * 255,
			l * 255
		];
	}, v.oklch.oklab = function(e) {
		return v.lch.lab(e);
	}, v.lab.xyz = function(e) {
		let t = e[0], n = e[1], r = e[2], i, a, o;
		a = (t + 16) / 116, i = n / 500 + a, o = a - r / 200;
		let s = a ** 3, c = i ** 3, l = o ** 3;
		return a = s > b ? s : (a - 16 / 116) / 7.787, i = c > b ? c : (i - 16 / 116) / 7.787, o = l > b ? l : (o - 16 / 116) / 7.787, i *= 95.047, a *= 100, o *= 108.883, [
			i,
			a,
			o
		];
	}, v.lab.lch = function(e) {
		let t = e[0], n = e[1], r = e[2], i;
		return i = Math.atan2(r, n) * 360 / 2 / Math.PI, i < 0 && (i += 360), [
			t,
			Math.sqrt(n * n + r * r),
			i
		];
	}, v.lch.lab = function(e) {
		let t = e[0], n = e[1], r = e[2] / 360 * 2 * Math.PI;
		return [
			t,
			n * Math.cos(r),
			n * Math.sin(r)
		];
	}, v.rgb.ansi16 = function(e, t = null) {
		let [n, r, i] = e, a = t === null ? v.rgb.hsv(e)[2] : t;
		if (a = Math.round(a / 50), a === 0) return 30;
		let o = 30 + (Math.round(i / 255) << 2 | Math.round(r / 255) << 1 | Math.round(n / 255));
		return a === 2 && (o += 60), o;
	}, v.hsv.ansi16 = function(e) {
		return v.rgb.ansi16(v.hsv.rgb(e), e[2]);
	}, v.rgb.ansi256 = function(e) {
		let t = e[0], n = e[1], r = e[2];
		return t >> 4 == n >> 4 && n >> 4 == r >> 4 ? t < 8 ? 16 : t > 248 ? 231 : Math.round((t - 8) / 247 * 24) + 232 : 16 + 36 * Math.round(t / 255 * 5) + 6 * Math.round(n / 255 * 5) + Math.round(r / 255 * 5);
	}, v.ansi16.rgb = function(e) {
		e = e[0];
		let t = e % 10;
		if (t === 0 || t === 7) return e > 50 && (t += 3.5), t = t / 10.5 * 255, [
			t,
			t,
			t
		];
		let n = (Math.trunc(e > 50) + 1) * .5;
		return [
			(t & 1) * n * 255,
			(t >> 1 & 1) * n * 255,
			(t >> 2 & 1) * n * 255
		];
	}, v.ansi256.rgb = function(e) {
		if (e = e[0], e >= 232) {
			let t = (e - 232) * 10 + 8;
			return [
				t,
				t,
				t
			];
		}
		e -= 16;
		let t;
		return [
			Math.floor(e / 36) / 5 * 255,
			Math.floor((t = e % 36) / 6) / 5 * 255,
			t % 6 / 5 * 255
		];
	}, v.rgb.hex = function(e) {
		let t = (((Math.round(e[0]) & 255) << 16) + ((Math.round(e[1]) & 255) << 8) + (Math.round(e[2]) & 255)).toString(16).toUpperCase();
		return "000000".slice(t.length) + t;
	}, v.hex.rgb = function(e) {
		let t = e.toString(16).match(/[a-f\d]{6}|[a-f\d]{3}/i);
		if (!t) return [
			0,
			0,
			0
		];
		let n = t[0];
		t[0].length === 3 && (n = [...n].map((e) => e + e).join(""));
		let r = Number.parseInt(n, 16);
		return [
			r >> 16 & 255,
			r >> 8 & 255,
			r & 255
		];
	}, v.rgb.hcg = function(e) {
		let t = e[0] / 255, n = e[1] / 255, r = e[2] / 255, i = Math.max(Math.max(t, n), r), a = Math.min(Math.min(t, n), r), o = i - a, s, c = o < 1 ? a / (1 - o) : 0;
		return s = o <= 0 ? 0 : i === t ? (n - r) / o % 6 : i === n ? 2 + (r - t) / o : 4 + (t - n) / o, s /= 6, s %= 1, [
			s * 360,
			o * 100,
			c * 100
		];
	}, v.hsl.hcg = function(e) {
		let t = e[1] / 100, n = e[2] / 100, r = n < .5 ? 2 * t * n : 2 * t * (1 - n), i = 0;
		return r < 1 && (i = (n - .5 * r) / (1 - r)), [
			e[0],
			r * 100,
			i * 100
		];
	}, v.hsv.hcg = function(e) {
		let t = e[1] / 100, n = e[2] / 100, r = t * n, i = 0;
		return r < 1 && (i = (n - r) / (1 - r)), [
			e[0],
			r * 100,
			i * 100
		];
	}, v.hcg.rgb = function(e) {
		let t = e[0] / 360, n = e[1] / 100, r = e[2] / 100;
		if (n === 0) return [
			r * 255,
			r * 255,
			r * 255
		];
		let i = [
			0,
			0,
			0
		], a = t % 1 * 6, o = a % 1, s = 1 - o, c = 0;
		switch (Math.floor(a)) {
			case 0:
				i[0] = 1, i[1] = o, i[2] = 0;
				break;
			case 1:
				i[0] = s, i[1] = 1, i[2] = 0;
				break;
			case 2:
				i[0] = 0, i[1] = 1, i[2] = o;
				break;
			case 3:
				i[0] = 0, i[1] = s, i[2] = 1;
				break;
			case 4:
				i[0] = o, i[1] = 0, i[2] = 1;
				break;
			default: i[0] = 1, i[1] = 0, i[2] = s;
		}
		return c = (1 - n) * r, [
			(n * i[0] + c) * 255,
			(n * i[1] + c) * 255,
			(n * i[2] + c) * 255
		];
	}, v.hcg.hsv = function(e) {
		let t = e[1] / 100, n = t + e[2] / 100 * (1 - t), r = 0;
		return n > 0 && (r = t / n), [
			e[0],
			r * 100,
			n * 100
		];
	}, v.hcg.hsl = function(e) {
		let t = e[1] / 100, n = e[2] / 100 * (1 - t) + .5 * t, r = 0;
		return n > 0 && n < .5 ? r = t / (2 * n) : n >= .5 && n < 1 && (r = t / (2 * (1 - n))), [
			e[0],
			r * 100,
			n * 100
		];
	}, v.hcg.hwb = function(e) {
		let t = e[1] / 100, n = t + e[2] / 100 * (1 - t);
		return [
			e[0],
			(n - t) * 100,
			(1 - n) * 100
		];
	}, v.hwb.hcg = function(e) {
		let t = e[1] / 100, n = 1 - e[2] / 100, r = n - t, i = 0;
		return r < 1 && (i = (n - r) / (1 - r)), [
			e[0],
			r * 100,
			i * 100
		];
	}, v.apple.rgb = function(e) {
		return [
			e[0] / 65535 * 255,
			e[1] / 65535 * 255,
			e[2] / 65535 * 255
		];
	}, v.rgb.apple = function(e) {
		return [
			e[0] / 255 * 65535,
			e[1] / 255 * 65535,
			e[2] / 255 * 65535
		];
	}, v.gray.rgb = function(e) {
		return [
			e[0] / 100 * 255,
			e[0] / 100 * 255,
			e[0] / 100 * 255
		];
	}, v.gray.hsl = function(e) {
		return [
			0,
			0,
			e[0]
		];
	}, v.gray.hsv = v.gray.hsl, v.gray.hwb = function(e) {
		return [
			0,
			100,
			e[0]
		];
	}, v.gray.cmyk = function(e) {
		return [
			0,
			0,
			0,
			e[0]
		];
	}, v.gray.lab = function(e) {
		return [
			e[0],
			0,
			0
		];
	}, v.gray.hex = function(e) {
		let t = Math.round(e[0] / 100 * 255) & 255, n = ((t << 16) + (t << 8) + t).toString(16).toUpperCase();
		return "000000".slice(n.length) + n;
	}, v.rgb.gray = function(e) {
		return [(e[0] + e[1] + e[2]) / 3 / 255 * 100];
	};
	function w() {
		let e = {}, t = Object.keys(y);
		for (let { length: n } = t, r = 0; r < n; r++) e[t[r]] = {
			distance: -1,
			parent: null
		};
		return e;
	}
	function T(e) {
		let t = w(), n = [e];
		for (t[e].distance = 0; n.length > 0;) {
			let e = n.pop(), r = Object.keys(y[e]);
			for (let { length: i } = r, a = 0; a < i; a++) {
				let i = r[a], o = t[i];
				o.distance === -1 && (o.distance = t[e].distance + 1, o.parent = e, n.unshift(i));
			}
		}
		return t;
	}
	function E(e, t) {
		return function(n) {
			return t(e(n));
		};
	}
	function D(e, t) {
		let n = [t[e].parent, e], r = y[t[e].parent][e], i = t[e].parent;
		for (; t[i].parent;) n.unshift(t[i].parent), r = E(y[t[i].parent][i], r), i = t[i].parent;
		return r.conversion = n, r;
	}
	function O(e) {
		let t = T(e), n = {}, r = Object.keys(t);
		for (let { length: e } = r, i = 0; i < e; i++) {
			let e = r[i];
			t[e].parent !== null && (n[e] = D(e, t));
		}
		return n;
	}
	var k = O, A = {}, j = Object.keys(y);
	function M(e) {
		let t = function(...t) {
			let n = t[0];
			return n == null ? n : (n.length > 1 && (t = n), e(t));
		};
		return "conversion" in e && (t.conversion = e.conversion), t;
	}
	function N(e) {
		let t = function(...t) {
			let n = t[0];
			if (n == null) return n;
			n.length > 1 && (t = n);
			let r = e(t);
			if (typeof r == "object") for (let { length: e } = r, t = 0; t < e; t++) r[t] = Math.round(r[t]);
			return r;
		};
		return "conversion" in e && (t.conversion = e.conversion), t;
	}
	for (let e of j) {
		A[e] = {}, Object.defineProperty(A[e], "channels", { value: y[e].channels }), Object.defineProperty(A[e], "labels", { value: y[e].labels });
		let t = k(e), n = Object.keys(t);
		for (let r of n) {
			let n = t[r];
			A[e][r] = N(n), A[e][r].raw = M(n);
		}
	}
	var P = A, F = [
		"keyword",
		"gray",
		"hex"
	], I = {};
	for (let e of Object.keys(P)) I[[...P[e].labels].sort().join("")] = e;
	var L = {};
	function R(e, t) {
		if (!(this instanceof R)) return new R(e, t);
		if (t && t in F && (t = null), t && !(t in P)) throw Error("Unknown model: " + t);
		let n, r;
		if (e == null) this.model = "rgb", this.color = [
			0,
			0,
			0
		], this.valpha = 1;
		else if (e instanceof R) this.model = e.model, this.color = [...e.color], this.valpha = e.valpha;
		else if (typeof e == "string") {
			let t = g.get(e);
			if (t === null) throw Error("Unable to parse color from string: " + e);
			this.model = t.model, r = P[this.model].channels, this.color = t.value.slice(0, r), this.valpha = typeof t.value[r] == "number" ? t.value[r] : 1;
		} else if (e.length > 0) {
			this.model = t || "rgb", r = P[this.model].channels;
			let n = Array.prototype.slice.call(e, 0, r);
			this.color = W(n, r), this.valpha = typeof e[r] == "number" ? e[r] : 1;
		} else if (typeof e == "number") this.model = "rgb", this.color = [
			e >> 16 & 255,
			e >> 8 & 255,
			e & 255
		], this.valpha = 1;
		else {
			this.valpha = 1;
			let t = Object.keys(e);
			"alpha" in e && (t.splice(t.indexOf("alpha"), 1), this.valpha = typeof e.alpha == "number" ? e.alpha : 0);
			let r = t.sort().join("");
			if (!(r in I)) throw Error("Unable to parse color from object: " + JSON.stringify(e));
			this.model = I[r];
			let { labels: i } = P[this.model], a = [];
			for (n = 0; n < i.length; n++) a.push(e[i[n]]);
			this.color = W(a);
		}
		if (L[this.model]) for (r = P[this.model].channels, n = 0; n < r; n++) {
			let e = L[this.model][n];
			e && (this.color[n] = e(this.color[n]));
		}
		this.valpha = Math.max(0, Math.min(1, this.valpha)), Object.freeze && Object.freeze(this);
	}
	R.prototype = {
		toString() {
			return this.string();
		},
		toJSON() {
			return this[this.model]();
		},
		string(e) {
			let t = this.model in g.to ? this : this.rgb();
			t = t.round(typeof e == "number" ? e : 1);
			let n = t.valpha === 1 ? t.color : [...t.color, this.valpha];
			return g.to[t.model](...n);
		},
		percentString(e) {
			let t = this.rgb().round(typeof e == "number" ? e : 1), n = t.valpha === 1 ? t.color : [...t.color, this.valpha];
			return g.to.rgb.percent(...n);
		},
		array() {
			return this.valpha === 1 ? [...this.color] : [...this.color, this.valpha];
		},
		object() {
			let e = {}, { channels: t } = P[this.model], { labels: n } = P[this.model];
			for (let r = 0; r < t; r++) e[n[r]] = this.color[r];
			return this.valpha !== 1 && (e.alpha = this.valpha), e;
		},
		unitArray() {
			let e = this.rgb().color;
			return e[0] /= 255, e[1] /= 255, e[2] /= 255, this.valpha !== 1 && e.push(this.valpha), e;
		},
		unitObject() {
			let e = this.rgb().object();
			return e.r /= 255, e.g /= 255, e.b /= 255, this.valpha !== 1 && (e.alpha = this.valpha), e;
		},
		round(e) {
			return e = Math.max(e || 0, 0), new R([...this.color.map(B(e)), this.valpha], this.model);
		},
		alpha(e) {
			return e === void 0 ? this.valpha : new R([...this.color, Math.max(0, Math.min(1, e))], this.model);
		},
		red: V("rgb", 0, H(255)),
		green: V("rgb", 1, H(255)),
		blue: V("rgb", 2, H(255)),
		hue: V([
			"hsl",
			"hsv",
			"hsl",
			"hwb",
			"hcg"
		], 0, (e) => (e % 360 + 360) % 360),
		saturationl: V("hsl", 1, H(100)),
		lightness: V("hsl", 2, H(100)),
		saturationv: V("hsv", 1, H(100)),
		value: V("hsv", 2, H(100)),
		chroma: V("hcg", 1, H(100)),
		gray: V("hcg", 2, H(100)),
		white: V("hwb", 1, H(100)),
		wblack: V("hwb", 2, H(100)),
		cyan: V("cmyk", 0, H(100)),
		magenta: V("cmyk", 1, H(100)),
		yellow: V("cmyk", 2, H(100)),
		black: V("cmyk", 3, H(100)),
		x: V("xyz", 0, H(95.047)),
		y: V("xyz", 1, H(100)),
		z: V("xyz", 2, H(108.833)),
		l: V("lab", 0, H(100)),
		a: V("lab", 1),
		b: V("lab", 2),
		keyword(e) {
			return e === void 0 ? P[this.model].keyword(this.color) : new R(e);
		},
		hex(e) {
			return e === void 0 ? g.to.hex(...this.rgb().round().color) : new R(e);
		},
		hexa(e) {
			if (e !== void 0) return new R(e);
			let t = this.rgb().round().color, n = Math.round(this.valpha * 255).toString(16).toUpperCase();
			return n.length === 1 && (n = "0" + n), g.to.hex(...t) + n;
		},
		rgbNumber() {
			let e = this.rgb().color;
			return (e[0] & 255) << 16 | (e[1] & 255) << 8 | e[2] & 255;
		},
		luminosity() {
			let e = this.rgb().color, t = [];
			for (let [n, r] of e.entries()) {
				let e = r / 255;
				t[n] = e <= .04045 ? e / 12.92 : ((e + .055) / 1.055) ** 2.4;
			}
			return .2126 * t[0] + .7152 * t[1] + .0722 * t[2];
		},
		contrast(e) {
			let t = this.luminosity(), n = e.luminosity();
			return t > n ? (t + .05) / (n + .05) : (n + .05) / (t + .05);
		},
		level(e) {
			let t = this.contrast(e);
			return t >= 7 ? "AAA" : t >= 4.5 ? "AA" : "";
		},
		isDark() {
			let e = this.rgb().color;
			return (e[0] * 2126 + e[1] * 7152 + e[2] * 722) / 1e4 < 128;
		},
		isLight() {
			return !this.isDark();
		},
		negate() {
			let e = this.rgb();
			for (let t = 0; t < 3; t++) e.color[t] = 255 - e.color[t];
			return e;
		},
		lighten(e) {
			let t = this.hsl();
			return t.color[2] += t.color[2] * e, t;
		},
		darken(e) {
			let t = this.hsl();
			return t.color[2] -= t.color[2] * e, t;
		},
		saturate(e) {
			let t = this.hsl();
			return t.color[1] += t.color[1] * e, t;
		},
		desaturate(e) {
			let t = this.hsl();
			return t.color[1] -= t.color[1] * e, t;
		},
		whiten(e) {
			let t = this.hwb();
			return t.color[1] += t.color[1] * e, t;
		},
		blacken(e) {
			let t = this.hwb();
			return t.color[2] += t.color[2] * e, t;
		},
		grayscale() {
			let e = this.rgb().color, t = e[0] * .3 + e[1] * .59 + e[2] * .11;
			return R.rgb(t, t, t);
		},
		fade(e) {
			return this.alpha(this.valpha - this.valpha * e);
		},
		opaquer(e) {
			return this.alpha(this.valpha + this.valpha * e);
		},
		rotate(e) {
			let t = this.hsl(), n = t.color[0];
			return n = (n + e) % 360, n = n < 0 ? 360 + n : n, t.color[0] = n, t;
		},
		mix(e, t) {
			if (!e || !e.rgb) throw Error("Argument to \"mix\" was not a Color instance, but rather an instance of " + typeof e);
			let n = e.rgb(), r = this.rgb(), i = t === void 0 ? .5 : t, a = 2 * i - 1, o = n.alpha() - r.alpha(), s = ((a * o === -1 ? a : (a + o) / (1 + a * o)) + 1) / 2, c = 1 - s;
			return R.rgb(s * n.red() + c * r.red(), s * n.green() + c * r.green(), s * n.blue() + c * r.blue(), n.alpha() * i + r.alpha() * (1 - i));
		}
	};
	for (let e of Object.keys(P)) {
		if (F.includes(e)) continue;
		let { channels: t } = P[e];
		R.prototype[e] = function(...t) {
			return this.model === e ? new R(this) : t.length > 0 ? new R(t, e) : new R([...U(P[this.model][e].raw(this.color)), this.valpha], e);
		}, R[e] = function(...n) {
			let r = n[0];
			return typeof r == "number" && (r = W(n, t)), new R(r, e);
		};
	}
	function z(e, t) {
		return Number(e.toFixed(t));
	}
	function B(e) {
		return function(t) {
			return z(t, e);
		};
	}
	function V(e, t, n) {
		e = Array.isArray(e) ? e : [e];
		for (let r of e) (L[r] ||= [])[t] = n;
		return e = e[0], function(r) {
			let i;
			return r === void 0 ? (i = this[e]().color[t], n && (i = n(i)), i) : (n && (r = n(r)), i = this[e](), i.color[t] = r, i);
		};
	}
	function H(e) {
		return function(t) {
			return Math.max(0, Math.min(e, t));
		};
	}
	function U(e) {
		return Array.isArray(e) ? e : [e];
	}
	function W(e, t) {
		for (let n = 0; n < t; n++) typeof e[n] != "number" && (e[n] = 0);
		return e;
	}
	var G = R;
})), se = /* @__PURE__ */ i(((e, t) => {
	t.exports = oe().default;
})), ce = /* @__PURE__ */ i(((e, t) => {
	var n = se(), r = a(), i = {
		multiband: "multiband",
		"b-w": "b-w",
		bw: "b-w",
		cmyk: "cmyk",
		srgb: "srgb"
	};
	function o(e) {
		return this._setBackgroundColourOption("tint", e), this;
	}
	function s(e) {
		return this.options.greyscale = r.bool(e) ? e : !0, this;
	}
	function c(e) {
		return this.greyscale(e);
	}
	function l(e) {
		if (!r.string(e)) throw r.invalidParameterError("colourspace", "string", e);
		return this.options.colourspacePipeline = e, this;
	}
	function u(e) {
		return this.pipelineColourspace(e);
	}
	function d(e) {
		if (!r.string(e)) throw r.invalidParameterError("colourspace", "string", e);
		return this.options.colourspace = e, this;
	}
	function f(e) {
		return this.toColourspace(e);
	}
	function p(e) {
		if (r.object(e) || r.string(e) && e.length >= 3 && e.length <= 200) {
			let t = n(e);
			return [
				t.red(),
				t.green(),
				t.blue(),
				Math.round(t.alpha() * 255)
			];
		} else throw r.invalidParameterError("background", "object or string", e);
	}
	function m(e, t) {
		r.defined(t) && (this.options[e] = p(t));
	}
	t.exports = (e) => {
		Object.assign(e.prototype, {
			tint: o,
			greyscale: s,
			grayscale: c,
			pipelineColourspace: l,
			pipelineColorspace: u,
			toColourspace: d,
			toColorspace: f,
			_getBackgroundColourOption: p,
			_setBackgroundColourOption: m
		}), e.colourspace = i, e.colorspace = i;
	};
})), le = /* @__PURE__ */ i(((e, t) => {
	var n = a(), r = {
		and: "and",
		or: "or",
		eor: "eor"
	};
	function i() {
		return this.options.removeAlpha = !0, this;
	}
	function o(e) {
		if (n.defined(e)) if (n.number(e) && n.inRange(e, 0, 1)) this.options.ensureAlpha = e;
		else throw n.invalidParameterError("alpha", "number between 0 and 1", e);
		else this.options.ensureAlpha = 1;
		return this;
	}
	function s(e) {
		let t = {
			red: 0,
			green: 1,
			blue: 2,
			alpha: 3
		};
		if (Object.keys(t).includes(e) && (e = t[e]), n.integer(e) && n.inRange(e, 0, 4)) this.options.extractChannel = e;
		else throw n.invalidParameterError("channel", "integer or one of: red, green, blue, alpha", e);
		return this;
	}
	function c(e, t) {
		return Array.isArray(e) ? e.forEach(function(e) {
			this.options.joinChannelIn.push(this._createInputDescriptor(e, t));
		}, this) : this.options.joinChannelIn.push(this._createInputDescriptor(e, t)), this;
	}
	function l(e) {
		if (n.string(e) && n.inArray(e, [
			"and",
			"or",
			"eor"
		])) this.options.bandBoolOp = e;
		else throw n.invalidParameterError("boolOp", "one of: and, or, eor", e);
		return this;
	}
	t.exports = (e) => {
		Object.assign(e.prototype, {
			removeAlpha: i,
			ensureAlpha: o,
			extractChannel: s,
			joinChannel: c,
			bandbool: l
		}), e.bool = r;
	};
})), ue = /* @__PURE__ */ i(((e, n) => {
	var r = t("node:path"), i = a(), o = $(), s = new Map([
		["heic", "heif"],
		["heif", "heif"],
		["avif", "avif"],
		["jpeg", "jpeg"],
		["jpg", "jpeg"],
		["jpe", "jpeg"],
		["tile", "tile"],
		["dz", "tile"],
		["png", "png"],
		["raw", "raw"],
		["tiff", "tiff"],
		["tif", "tiff"],
		["webp", "webp"],
		["gif", "gif"],
		["jp2", "jp2"],
		["jpx", "jp2"],
		["j2k", "jp2"],
		["j2c", "jp2"],
		["jxl", "jxl"]
	]), c = /\.(jp[2x]|j2[kc])$/i, l = () => /* @__PURE__ */ Error("JP2 output requires libvips with support for OpenJPEG"), u = (e) => 1 << 31 - Math.clz32(Math.ceil(Math.log2(e)));
	function d(e, t) {
		let n;
		if (i.string(e) ? i.string(this.options.input.file) && r.resolve(this.options.input.file) === r.resolve(e) ? n = /* @__PURE__ */ Error("Cannot use same file for input and output") : c.test(r.extname(e)) && !this.constructor.format.jp2k.output.file && (n = l()) : n = /* @__PURE__ */ Error("Missing output file path"), n) if (i.fn(t)) t(n);
		else return Promise.reject(n);
		else {
			this.options.fileOut = e;
			let n = Error();
			return this._pipeline(t, n);
		}
		return this;
	}
	function f(e, t) {
		i.object(e) ? this._setBooleanOption("resolveWithObject", e.resolveWithObject) : this.options.resolveWithObject && (this.options.resolveWithObject = !1), this.options.fileOut = "";
		let n = Error();
		return this._pipeline(i.fn(e) ? e : t, n);
	}
	function p() {
		return this.options.keepMetadata |= 1, this;
	}
	function m(e) {
		if (i.object(e)) for (let [t, n] of Object.entries(e)) if (i.object(n)) for (let [e, r] of Object.entries(n)) if (i.string(r)) this.options.withExif[`exif-${t.toLowerCase()}-${e}`] = r;
		else throw i.invalidParameterError(`${t}.${e}`, "string", r);
		else throw i.invalidParameterError(t, "object", n);
		else throw i.invalidParameterError("exif", "object", e);
		return this.options.withExifMerge = !1, this.keepExif();
	}
	function h(e) {
		return this.withExif(e), this.options.withExifMerge = !0, this;
	}
	function g() {
		return this.options.keepMetadata |= 8, this;
	}
	function _(e, t) {
		if (i.string(e)) this.options.withIccProfile = e;
		else throw i.invalidParameterError("icc", "string", e);
		if (this.keepIccProfile(), i.object(t) && i.defined(t.attach)) if (i.bool(t.attach)) t.attach || (this.options.keepMetadata &= -9);
		else throw i.invalidParameterError("attach", "boolean", t.attach);
		return this;
	}
	function v() {
		return this.options.keepMetadata |= 2, this;
	}
	function y(e) {
		if (i.string(e) && e.length > 0) this.options.withXmp = e, this.options.keepMetadata |= 2;
		else throw i.invalidParameterError("xmp", "non-empty string", e);
		return this;
	}
	function b() {
		return this.options.keepMetadata = 31, this;
	}
	function x(e) {
		if (this.keepMetadata(), this.withIccProfile("srgb"), i.object(e)) {
			if (i.defined(e.orientation)) if (i.integer(e.orientation) && i.inRange(e.orientation, 1, 8)) this.options.withMetadataOrientation = e.orientation;
			else throw i.invalidParameterError("orientation", "integer between 1 and 8", e.orientation);
			if (i.defined(e.density)) if (i.number(e.density) && e.density > 0) this.options.withMetadataDensity = e.density;
			else throw i.invalidParameterError("density", "positive number", e.density);
			i.defined(e.icc) && this.withIccProfile(e.icc), i.defined(e.exif) && this.withExifMerge(e.exif);
		}
		return this;
	}
	function S(e, t) {
		let n = s.get((i.object(e) && i.string(e.id) ? e.id : e).toLowerCase());
		if (!n) throw i.invalidParameterError("format", `one of: ${[...s.keys()].join(", ")}`, e);
		return this[n](t);
	}
	function C(e) {
		if (i.object(e)) {
			if (i.defined(e.quality)) if (i.integer(e.quality) && i.inRange(e.quality, 1, 100)) this.options.jpegQuality = e.quality;
			else throw i.invalidParameterError("quality", "integer between 1 and 100", e.quality);
			if (i.defined(e.progressive) && this._setBooleanOption("jpegProgressive", e.progressive), i.defined(e.chromaSubsampling)) if (i.string(e.chromaSubsampling) && i.inArray(e.chromaSubsampling, ["4:2:0", "4:4:4"])) this.options.jpegChromaSubsampling = e.chromaSubsampling;
			else throw i.invalidParameterError("chromaSubsampling", "one of: 4:2:0, 4:4:4", e.chromaSubsampling);
			let t = i.bool(e.optimizeCoding) ? e.optimizeCoding : e.optimiseCoding;
			if (i.defined(t) && this._setBooleanOption("jpegOptimiseCoding", t), i.defined(e.mozjpeg)) if (i.bool(e.mozjpeg)) e.mozjpeg && (this.options.jpegTrellisQuantisation = !0, this.options.jpegOvershootDeringing = !0, this.options.jpegOptimiseScans = !0, this.options.jpegProgressive = !0, this.options.jpegQuantisationTable = 3);
			else throw i.invalidParameterError("mozjpeg", "boolean", e.mozjpeg);
			let n = i.bool(e.trellisQuantization) ? e.trellisQuantization : e.trellisQuantisation;
			i.defined(n) && this._setBooleanOption("jpegTrellisQuantisation", n), i.defined(e.overshootDeringing) && this._setBooleanOption("jpegOvershootDeringing", e.overshootDeringing);
			let r = i.bool(e.optimizeScans) ? e.optimizeScans : e.optimiseScans;
			i.defined(r) && (this._setBooleanOption("jpegOptimiseScans", r), r && (this.options.jpegProgressive = !0));
			let a = i.number(e.quantizationTable) ? e.quantizationTable : e.quantisationTable;
			if (i.defined(a)) if (i.integer(a) && i.inRange(a, 0, 8)) this.options.jpegQuantisationTable = a;
			else throw i.invalidParameterError("quantisationTable", "integer between 0 and 8", a);
		}
		return this._updateFormatOut("jpeg", e);
	}
	function w(e) {
		if (i.object(e)) {
			if (i.defined(e.progressive) && this._setBooleanOption("pngProgressive", e.progressive), i.defined(e.compressionLevel)) if (i.integer(e.compressionLevel) && i.inRange(e.compressionLevel, 0, 9)) this.options.pngCompressionLevel = e.compressionLevel;
			else throw i.invalidParameterError("compressionLevel", "integer between 0 and 9", e.compressionLevel);
			i.defined(e.adaptiveFiltering) && this._setBooleanOption("pngAdaptiveFiltering", e.adaptiveFiltering);
			let t = e.colours || e.colors;
			if (i.defined(t)) if (i.integer(t) && i.inRange(t, 2, 256)) this.options.pngBitdepth = u(t);
			else throw i.invalidParameterError("colours", "integer between 2 and 256", t);
			if (i.defined(e.palette) ? this._setBooleanOption("pngPalette", e.palette) : [
				e.quality,
				e.effort,
				e.colours,
				e.colors,
				e.dither
			].some(i.defined) && this._setBooleanOption("pngPalette", !0), this.options.pngPalette) {
				if (i.defined(e.quality)) if (i.integer(e.quality) && i.inRange(e.quality, 0, 100)) this.options.pngQuality = e.quality;
				else throw i.invalidParameterError("quality", "integer between 0 and 100", e.quality);
				if (i.defined(e.effort)) if (i.integer(e.effort) && i.inRange(e.effort, 1, 10)) this.options.pngEffort = e.effort;
				else throw i.invalidParameterError("effort", "integer between 1 and 10", e.effort);
				if (i.defined(e.dither)) if (i.number(e.dither) && i.inRange(e.dither, 0, 1)) this.options.pngDither = e.dither;
				else throw i.invalidParameterError("dither", "number between 0.0 and 1.0", e.dither);
			}
		}
		return this._updateFormatOut("png", e);
	}
	function T(e) {
		if (i.object(e)) {
			if (i.defined(e.quality)) if (i.integer(e.quality) && i.inRange(e.quality, 1, 100)) this.options.webpQuality = e.quality;
			else throw i.invalidParameterError("quality", "integer between 1 and 100", e.quality);
			if (i.defined(e.alphaQuality)) if (i.integer(e.alphaQuality) && i.inRange(e.alphaQuality, 0, 100)) this.options.webpAlphaQuality = e.alphaQuality;
			else throw i.invalidParameterError("alphaQuality", "integer between 0 and 100", e.alphaQuality);
			if (i.defined(e.lossless) && this._setBooleanOption("webpLossless", e.lossless), i.defined(e.nearLossless) && this._setBooleanOption("webpNearLossless", e.nearLossless), i.defined(e.smartSubsample) && this._setBooleanOption("webpSmartSubsample", e.smartSubsample), i.defined(e.smartDeblock) && this._setBooleanOption("webpSmartDeblock", e.smartDeblock), i.defined(e.preset)) if (i.string(e.preset) && i.inArray(e.preset, [
				"default",
				"photo",
				"picture",
				"drawing",
				"icon",
				"text"
			])) this.options.webpPreset = e.preset;
			else throw i.invalidParameterError("preset", "one of: default, photo, picture, drawing, icon, text", e.preset);
			if (i.defined(e.effort)) if (i.integer(e.effort) && i.inRange(e.effort, 0, 6)) this.options.webpEffort = e.effort;
			else throw i.invalidParameterError("effort", "integer between 0 and 6", e.effort);
			i.defined(e.minSize) && this._setBooleanOption("webpMinSize", e.minSize), i.defined(e.mixed) && this._setBooleanOption("webpMixed", e.mixed);
		}
		return O(e, this.options), this._updateFormatOut("webp", e);
	}
	function E(e) {
		if (i.object(e)) {
			i.defined(e.reuse) && this._setBooleanOption("gifReuse", e.reuse), i.defined(e.progressive) && this._setBooleanOption("gifProgressive", e.progressive);
			let t = e.colours || e.colors;
			if (i.defined(t)) if (i.integer(t) && i.inRange(t, 2, 256)) this.options.gifBitdepth = u(t);
			else throw i.invalidParameterError("colours", "integer between 2 and 256", t);
			if (i.defined(e.effort)) if (i.number(e.effort) && i.inRange(e.effort, 1, 10)) this.options.gifEffort = e.effort;
			else throw i.invalidParameterError("effort", "integer between 1 and 10", e.effort);
			if (i.defined(e.dither)) if (i.number(e.dither) && i.inRange(e.dither, 0, 1)) this.options.gifDither = e.dither;
			else throw i.invalidParameterError("dither", "number between 0.0 and 1.0", e.dither);
			if (i.defined(e.interFrameMaxError)) if (i.number(e.interFrameMaxError) && i.inRange(e.interFrameMaxError, 0, 32)) this.options.gifInterFrameMaxError = e.interFrameMaxError;
			else throw i.invalidParameterError("interFrameMaxError", "number between 0.0 and 32.0", e.interFrameMaxError);
			if (i.defined(e.interPaletteMaxError)) if (i.number(e.interPaletteMaxError) && i.inRange(e.interPaletteMaxError, 0, 256)) this.options.gifInterPaletteMaxError = e.interPaletteMaxError;
			else throw i.invalidParameterError("interPaletteMaxError", "number between 0.0 and 256.0", e.interPaletteMaxError);
			if (i.defined(e.keepDuplicateFrames)) if (i.bool(e.keepDuplicateFrames)) this._setBooleanOption("gifKeepDuplicateFrames", e.keepDuplicateFrames);
			else throw i.invalidParameterError("keepDuplicateFrames", "boolean", e.keepDuplicateFrames);
		}
		return O(e, this.options), this._updateFormatOut("gif", e);
	}
	function D(e) {
		/* node:coverage ignore next 41 */
		if (!this.constructor.format.jp2k.output.buffer) throw l();
		if (i.object(e)) {
			if (i.defined(e.quality)) if (i.integer(e.quality) && i.inRange(e.quality, 1, 100)) this.options.jp2Quality = e.quality;
			else throw i.invalidParameterError("quality", "integer between 1 and 100", e.quality);
			if (i.defined(e.lossless)) if (i.bool(e.lossless)) this.options.jp2Lossless = e.lossless;
			else throw i.invalidParameterError("lossless", "boolean", e.lossless);
			if (i.defined(e.tileWidth)) if (i.integer(e.tileWidth) && i.inRange(e.tileWidth, 1, 32768)) this.options.jp2TileWidth = e.tileWidth;
			else throw i.invalidParameterError("tileWidth", "integer between 1 and 32768", e.tileWidth);
			if (i.defined(e.tileHeight)) if (i.integer(e.tileHeight) && i.inRange(e.tileHeight, 1, 32768)) this.options.jp2TileHeight = e.tileHeight;
			else throw i.invalidParameterError("tileHeight", "integer between 1 and 32768", e.tileHeight);
			if (i.defined(e.chromaSubsampling)) if (i.string(e.chromaSubsampling) && i.inArray(e.chromaSubsampling, ["4:2:0", "4:4:4"])) this.options.jp2ChromaSubsampling = e.chromaSubsampling;
			else throw i.invalidParameterError("chromaSubsampling", "one of: 4:2:0, 4:4:4", e.chromaSubsampling);
		}
		return this._updateFormatOut("jp2", e);
	}
	function O(e, t) {
		if (i.object(e) && i.defined(e.loop)) if (i.integer(e.loop) && i.inRange(e.loop, 0, 65535)) t.loop = e.loop;
		else throw i.invalidParameterError("loop", "integer between 0 and 65535", e.loop);
		if (i.object(e) && i.defined(e.delay)) if (i.integer(e.delay) && i.inRange(e.delay, 0, 65535)) t.delay = [e.delay];
		else if (Array.isArray(e.delay) && e.delay.every(i.integer) && e.delay.every((e) => i.inRange(e, 0, 65535))) t.delay = e.delay;
		else throw i.invalidParameterError("delay", "integer or an array of integers between 0 and 65535", e.delay);
	}
	function k(e) {
		if (i.object(e)) {
			if (i.defined(e.quality)) if (i.integer(e.quality) && i.inRange(e.quality, 1, 100)) this.options.tiffQuality = e.quality;
			else throw i.invalidParameterError("quality", "integer between 1 and 100", e.quality);
			if (i.defined(e.bitdepth)) if (i.integer(e.bitdepth) && i.inArray(e.bitdepth, [
				1,
				2,
				4,
				8
			])) this.options.tiffBitdepth = e.bitdepth;
			else throw i.invalidParameterError("bitdepth", "1, 2, 4 or 8", e.bitdepth);
			if (i.defined(e.tile) && this._setBooleanOption("tiffTile", e.tile), i.defined(e.tileWidth)) if (i.integer(e.tileWidth) && e.tileWidth > 0) this.options.tiffTileWidth = e.tileWidth;
			else throw i.invalidParameterError("tileWidth", "integer greater than zero", e.tileWidth);
			if (i.defined(e.tileHeight)) if (i.integer(e.tileHeight) && e.tileHeight > 0) this.options.tiffTileHeight = e.tileHeight;
			else throw i.invalidParameterError("tileHeight", "integer greater than zero", e.tileHeight);
			if (i.defined(e.miniswhite) && this._setBooleanOption("tiffMiniswhite", e.miniswhite), i.defined(e.pyramid) && this._setBooleanOption("tiffPyramid", e.pyramid), i.defined(e.xres)) if (i.number(e.xres) && e.xres > 0) this.options.tiffXres = e.xres;
			else throw i.invalidParameterError("xres", "number greater than zero", e.xres);
			if (i.defined(e.yres)) if (i.number(e.yres) && e.yres > 0) this.options.tiffYres = e.yres;
			else throw i.invalidParameterError("yres", "number greater than zero", e.yres);
			if (i.defined(e.compression)) if (i.string(e.compression) && i.inArray(e.compression, [
				"none",
				"jpeg",
				"deflate",
				"packbits",
				"ccittfax4",
				"lzw",
				"webp",
				"zstd",
				"jp2k"
			])) this.options.tiffCompression = e.compression;
			else throw i.invalidParameterError("compression", "one of: none, jpeg, deflate, packbits, ccittfax4, lzw, webp, zstd, jp2k", e.compression);
			if (i.defined(e.bigtiff) && this._setBooleanOption("tiffBigtiff", e.bigtiff), i.defined(e.predictor)) if (i.string(e.predictor) && i.inArray(e.predictor, [
				"none",
				"horizontal",
				"float"
			])) this.options.tiffPredictor = e.predictor;
			else throw i.invalidParameterError("predictor", "one of: none, horizontal, float", e.predictor);
			if (i.defined(e.resolutionUnit)) if (i.string(e.resolutionUnit) && i.inArray(e.resolutionUnit, ["inch", "cm"])) this.options.tiffResolutionUnit = e.resolutionUnit;
			else throw i.invalidParameterError("resolutionUnit", "one of: inch, cm", e.resolutionUnit);
		}
		return this._updateFormatOut("tiff", e);
	}
	function A(e) {
		return this.heif({
			...e,
			compression: "av1"
		});
	}
	function j(e) {
		if (i.object(e)) {
			if (i.string(e.compression) && i.inArray(e.compression, ["av1", "hevc"])) this.options.heifCompression = e.compression;
			else throw i.invalidParameterError("compression", "one of: av1, hevc", e.compression);
			if (i.defined(e.quality)) if (i.integer(e.quality) && i.inRange(e.quality, 1, 100)) this.options.heifQuality = e.quality;
			else throw i.invalidParameterError("quality", "integer between 1 and 100", e.quality);
			if (i.defined(e.lossless)) if (i.bool(e.lossless)) this.options.heifLossless = e.lossless;
			else throw i.invalidParameterError("lossless", "boolean", e.lossless);
			if (i.defined(e.effort)) if (i.integer(e.effort) && i.inRange(e.effort, 0, 9)) this.options.heifEffort = e.effort;
			else throw i.invalidParameterError("effort", "integer between 0 and 9", e.effort);
			if (i.defined(e.chromaSubsampling)) if (i.string(e.chromaSubsampling) && i.inArray(e.chromaSubsampling, ["4:2:0", "4:4:4"])) this.options.heifChromaSubsampling = e.chromaSubsampling;
			else throw i.invalidParameterError("chromaSubsampling", "one of: 4:2:0, 4:4:4", e.chromaSubsampling);
			if (i.defined(e.bitdepth)) if (i.integer(e.bitdepth) && i.inArray(e.bitdepth, [
				8,
				10,
				12
			])) {
				if (e.bitdepth !== 8 && this.constructor.versions.heif) throw i.invalidParameterError("bitdepth when using prebuilt binaries", 8, e.bitdepth);
				this.options.heifBitdepth = e.bitdepth;
			} else throw i.invalidParameterError("bitdepth", "8, 10 or 12", e.bitdepth);
		} else throw i.invalidParameterError("options", "Object", e);
		return this._updateFormatOut("heif", e);
	}
	function M(e) {
		if (i.object(e)) {
			if (i.defined(e.quality)) if (i.integer(e.quality) && i.inRange(e.quality, 1, 100)) this.options.jxlDistance = e.quality >= 30 ? .1 + (100 - e.quality) * .09 : 53 / 3e3 * e.quality * e.quality - 23 / 20 * e.quality + 25;
			else throw i.invalidParameterError("quality", "integer between 1 and 100", e.quality);
			else if (i.defined(e.distance)) if (i.number(e.distance) && i.inRange(e.distance, 0, 15)) this.options.jxlDistance = e.distance;
			else throw i.invalidParameterError("distance", "number between 0.0 and 15.0", e.distance);
			if (i.defined(e.decodingTier)) if (i.integer(e.decodingTier) && i.inRange(e.decodingTier, 0, 4)) this.options.jxlDecodingTier = e.decodingTier;
			else throw i.invalidParameterError("decodingTier", "integer between 0 and 4", e.decodingTier);
			if (i.defined(e.lossless)) if (i.bool(e.lossless)) this.options.jxlLossless = e.lossless;
			else throw i.invalidParameterError("lossless", "boolean", e.lossless);
			if (i.defined(e.effort)) if (i.integer(e.effort) && i.inRange(e.effort, 1, 9)) this.options.jxlEffort = e.effort;
			else throw i.invalidParameterError("effort", "integer between 1 and 9", e.effort);
		}
		return O(e, this.options), this._updateFormatOut("jxl", e);
	}
	function N(e) {
		if (i.object(e) && i.defined(e.depth)) if (i.string(e.depth) && i.inArray(e.depth, [
			"char",
			"uchar",
			"short",
			"ushort",
			"int",
			"uint",
			"float",
			"complex",
			"double",
			"dpcomplex"
		])) this.options.rawDepth = e.depth;
		else throw i.invalidParameterError("depth", "one of: char, uchar, short, ushort, int, uint, float, complex, double, dpcomplex", e.depth);
		return this._updateFormatOut("raw");
	}
	function P(e) {
		if (i.object(e)) {
			if (i.defined(e.size)) if (i.integer(e.size) && i.inRange(e.size, 1, 8192)) this.options.tileSize = e.size;
			else throw i.invalidParameterError("size", "integer between 1 and 8192", e.size);
			if (i.defined(e.overlap)) if (i.integer(e.overlap) && i.inRange(e.overlap, 0, 8192)) {
				if (e.overlap > this.options.tileSize) throw i.invalidParameterError("overlap", `<= size (${this.options.tileSize})`, e.overlap);
				this.options.tileOverlap = e.overlap;
			} else throw i.invalidParameterError("overlap", "integer between 0 and 8192", e.overlap);
			if (i.defined(e.container)) if (i.string(e.container) && i.inArray(e.container, ["fs", "zip"])) this.options.tileContainer = e.container;
			else throw i.invalidParameterError("container", "one of: fs, zip", e.container);
			if (i.defined(e.layout)) if (i.string(e.layout) && i.inArray(e.layout, [
				"dz",
				"google",
				"iiif",
				"iiif3",
				"zoomify"
			])) this.options.tileLayout = e.layout;
			else throw i.invalidParameterError("layout", "one of: dz, google, iiif, iiif3, zoomify", e.layout);
			if (i.defined(e.angle)) if (i.integer(e.angle) && !(e.angle % 90)) this.options.tileAngle = e.angle;
			else throw i.invalidParameterError("angle", "positive/negative multiple of 90", e.angle);
			if (this._setBackgroundColourOption("tileBackground", e.background), i.defined(e.depth)) if (i.string(e.depth) && i.inArray(e.depth, [
				"onepixel",
				"onetile",
				"one"
			])) this.options.tileDepth = e.depth;
			else throw i.invalidParameterError("depth", "one of: onepixel, onetile, one", e.depth);
			if (i.defined(e.skipBlanks)) if (i.integer(e.skipBlanks) && i.inRange(e.skipBlanks, -1, 65535)) this.options.tileSkipBlanks = e.skipBlanks;
			else throw i.invalidParameterError("skipBlanks", "integer between -1 and 255/65535", e.skipBlanks);
			else i.defined(e.layout) && e.layout === "google" && (this.options.tileSkipBlanks = 5);
			let t = i.bool(e.center) ? e.center : e.centre;
			if (i.defined(t) && this._setBooleanOption("tileCentre", t), i.defined(e.id)) if (i.string(e.id)) this.options.tileId = e.id;
			else throw i.invalidParameterError("id", "string", e.id);
			if (i.defined(e.basename)) if (i.string(e.basename)) this.options.tileBasename = e.basename;
			else throw i.invalidParameterError("basename", "string", e.basename);
		}
		if (i.inArray(this.options.formatOut, [
			"jpeg",
			"png",
			"webp"
		])) this.options.tileFormat = this.options.formatOut;
		else if (this.options.formatOut !== "input") throw i.invalidParameterError("format", "one of: jpeg, png, webp", this.options.formatOut);
		return this._updateFormatOut("dz");
	}
	function F(e) {
		if (!i.plainObject(e)) throw i.invalidParameterError("options", "object", e);
		if (i.integer(e.seconds) && i.inRange(e.seconds, 0, 3600)) this.options.timeoutSeconds = e.seconds;
		else throw i.invalidParameterError("seconds", "integer between 0 and 3600", e.seconds);
		return this;
	}
	function I(e, t) {
		return i.object(t) && t.force === !1 || (this.options.formatOut = e), this;
	}
	function L(e, t) {
		if (i.bool(t)) this.options[e] = t;
		else throw i.invalidParameterError(e, "boolean", t);
	}
	function R() {
		if (!this.options.streamOut) {
			this.options.streamOut = !0;
			let e = Error();
			this._pipeline(void 0, e);
		}
	}
	function z(e, t) {
		return typeof e == "function" ? (this._isStreamInput() ? this.on("finish", () => {
			this._flattenBufferIn(), o.pipeline(this.options, (n, r, a) => {
				n ? e(i.nativeError(n, t)) : e(null, r, a);
			});
		}) : o.pipeline(this.options, (n, r, a) => {
			n ? e(i.nativeError(n, t)) : e(null, r, a);
		}), this) : this.options.streamOut ? (this._isStreamInput() ? (this.once("finish", () => {
			this._flattenBufferIn(), o.pipeline(this.options, (e, n, r) => {
				e ? this.emit("error", i.nativeError(e, t)) : (this.emit("info", r), this.push(n)), this.push(null), this.on("end", () => this.emit("close"));
			});
		}), this.streamInFinished && this.emit("finish")) : o.pipeline(this.options, (e, n, r) => {
			e ? this.emit("error", i.nativeError(e, t)) : (this.emit("info", r), this.push(n)), this.push(null), this.on("end", () => this.emit("close"));
		}), this) : this._isStreamInput() ? new Promise((e, n) => {
			this.once("finish", () => {
				this._flattenBufferIn(), o.pipeline(this.options, (r, a, o) => {
					r ? n(i.nativeError(r, t)) : this.options.resolveWithObject ? e({
						data: a,
						info: o
					}) : e(a);
				});
			});
		}) : new Promise((e, n) => {
			o.pipeline(this.options, (r, a, o) => {
				r ? n(i.nativeError(r, t)) : this.options.resolveWithObject ? e({
					data: a,
					info: o
				}) : e(a);
			});
		});
	}
	n.exports = (e) => {
		Object.assign(e.prototype, {
			toFile: d,
			toBuffer: f,
			keepExif: p,
			withExif: m,
			withExifMerge: h,
			keepIccProfile: g,
			withIccProfile: _,
			keepXmp: v,
			withXmp: y,
			keepMetadata: b,
			withMetadata: x,
			toFormat: S,
			jpeg: C,
			jp2: D,
			png: w,
			webp: T,
			tiff: k,
			avif: A,
			heif: j,
			jxl: M,
			gif: E,
			raw: N,
			tile: P,
			timeout: F,
			_updateFormatOut: I,
			_setBooleanOption: L,
			_read: R,
			_pipeline: z
		});
	};
})), de = /* @__PURE__ */ i(((n, r) => {
	var i = t("node:events"), o = l(), s = a(), { runtimePlatformArch: c } = ee(), u = $(), d = c(), f = u.libvipsVersion(), p = u.format();
	p.heif.output.alias = ["avif", "heic"], p.jpeg.output.alias = ["jpe", "jpg"], p.tiff.output.alias = ["tif"], p.jp2k.output.alias = [
		"j2c",
		"j2k",
		"jp2",
		"jpx"
	];
	var m = {
		nearest: "nearest",
		bilinear: "bilinear",
		bicubic: "bicubic",
		locallyBoundedBicubic: "lbb",
		nohalo: "nohalo",
		vertexSplitQuadraticBasisSpline: "vsqbs"
	}, h = { vips: f.semver };
	/* node:coverage ignore next 15 */
	if (!f.isGlobal) if (f.isWasm) try {
		h = t("@img/sharp-wasm32/versions");
	} catch {}
	else try {
		h = t(`@img/sharp-${d}/versions`);
	} catch {
		try {
			h = t(`@img/sharp-libvips-${d}/versions`);
		} catch {}
	}
	/* node:coverage ignore next 5 */
	h.sharp = (Q(), e(A).default).version, h.heif && p.heif && (p.heif.input.fileSuffix = [".avif"], p.heif.output.alias = ["avif"]);
	function g(e) {
		return s.bool(e) ? e ? u.cache(50, 20, 100) : u.cache(0, 0, 0) : s.object(e) ? u.cache(e.memory, e.files, e.items) : u.cache();
	}
	g(!0);
	function _(e) {
		return u.concurrency(s.integer(e) ? e : null);
	}
	/* node:coverage ignore next 7 */
	o.familySync() === o.GLIBC && !u._isUsingJemalloc() ? u.concurrency(1) : o.familySync() === o.MUSL && u.concurrency() === 1024 && u.concurrency(t("node:os").availableParallelism());
	var v = new i.EventEmitter();
	function y() {
		return u.counters();
	}
	function b(e) {
		return u.simd(s.bool(e) ? e : null);
	}
	function x(e) {
		if (s.object(e)) if (Array.isArray(e.operation) && e.operation.every(s.string)) u.block(e.operation, !0);
		else throw s.invalidParameterError("operation", "Array<string>", e.operation);
		else throw s.invalidParameterError("options", "object", e);
	}
	function S(e) {
		if (s.object(e)) if (Array.isArray(e.operation) && e.operation.every(s.string)) u.block(e.operation, !1);
		else throw s.invalidParameterError("operation", "Array<string>", e.operation);
		else throw s.invalidParameterError("options", "object", e);
	}
	r.exports = (e) => {
		e.cache = g, e.concurrency = _, e.counters = y, e.simd = b, e.format = p, e.interpolators = m, e.versions = h, e.queue = v, e.block = x, e.unblock = S;
	};
})), fe = /* @__PURE__ */ i(((e, t) => {
	var n = te();
	ne()(n), re()(n), ie()(n), ae()(n), ce()(n), le()(n), ue()(n), de()(n), t.exports = n;
}));
//#endregion
export default fe();
export {};
