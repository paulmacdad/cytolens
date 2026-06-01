//! 2D density histogram binning.
//!
//! Generates a 2D count matrix for density plot rendering.

use wasm_bindgen::prelude::*;

/// Bin events into a 2D histogram.
///
/// Returns a flat Vec<u32> of length (bins_x * bins_y).
/// Index: row * bins_x + col (row = y bin, col = x bin).
#[wasm_bindgen]
pub fn density_2d(
    x_vals: &[f32],
    y_vals: &[f32],
    x_min: f32, x_max: f32,
    y_min: f32, y_max: f32,
    bins_x: u32, bins_y: u32,
) -> Vec<u32> {
    let bx = bins_x as usize;
    let by_ = bins_y as usize;
    let mut hist = vec![0u32; bx * by_];
    let n = x_vals.len().min(y_vals.len());
    let x_range = x_max - x_min;
    let y_range = y_max - y_min;
    
    for i in 0..n {
        let x = x_vals[i]; let y = y_vals[i];
        if x < x_min || x > x_max || y < y_min || y > y_max { continue; }
        let col = (((x - x_min) / x_range) * bins_x as f32) as usize;
        let row = (((y - y_min) / y_range) * bins_y as f32) as usize;
        let col = col.min(bx - 1);
        let row = row.min(by_ - 1);
        hist[row * bx + col] += 1;
    }
    
    hist
}
