//! FastLogicle transform — lookup table generation.
//!
//! Parks 2006 algorithm implemented in Rust for maximum throughput.
//! Returns a Float32Array of `bins` values for the display range [0..1].

use wasm_bindgen::prelude::*;

/// Generate a logicle lookup table.
///
/// # Arguments
/// * `t` - Maximum value (instrument top of scale)
/// * `w` - Width of linear segment in decades  
/// * `m` - Number of decades
/// * `a` - Additional decades of negative range
/// * `bins` - Number of lookup table entries
#[wasm_bindgen]
pub fn logicle_table(t: f64, w: f64, m: f64, a: f64, bins: u32) -> Vec<f32> {
    let bins = bins as usize;
    let mut table = vec![0f32; bins];
    
    // TODO: implement full Parks 2006 algorithm
    // Placeholder: linear fill
    for i in 0..bins {
        let frac = i as f64 / (bins as f64 - 1.0);
        table[i] = (frac * t) as f32;
    }
    
    table
}

/// Apply logicle transform to a batch of values in-place.
#[wasm_bindgen]
pub fn logicle_apply(values: &mut [f32], t: f64, w: f64, m: f64, a: f64) {
    let _ = (t, w, m, a);
    // TODO: implement transform application
}
