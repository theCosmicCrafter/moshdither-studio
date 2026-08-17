//! Raw (unnormalized) Bayer ordered-dither threshold tables.
//!
//! `palette_dither.rs` and `custom_matrix.rs` each hardcoded an identical
//! copy of these literals, then applied their own normalization on top --
//! `palette_dither::bayer4` divides by 16.0 (one past the max cell value,
//! so results land in `[0, 15/16]`), while `custom_matrix` divides by the
//! matrix's actual max value (`15` for BAYER_4), landing in `[0, 1]`
//! inclusive. Those divisors are a real behavioral difference and are left
//! alone here; only the raw integer tables themselves are shared.

/// 2x2 Bayer matrix, raw integer values (unnormalized).
pub const BAYER_2: [[u32; 2]; 2] = [[0, 2], [3, 1]];

/// 4x4 Bayer matrix, raw integer values (unnormalized).
pub const BAYER_4: [[u32; 4]; 4] = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
];
