//! Polygon gate evaluation — point-in-polygon at scale.
//!
//! Uses the ray casting algorithm optimised for SIMD-friendly access patterns.

use wasm_bindgen::prelude::*;

/// Evaluate polygon gate for all events.
///
/// Returns a Uint8Array mask: 1 = inside, 0 = outside.
///
/// # Arguments
/// * `x_vals` - X channel values for all events
/// * `y_vals` - Y channel values for all events  
/// * `vx` - Polygon vertex X coordinates (closed polygon)
/// * `vy` - Polygon vertex Y coordinates (closed polygon)
#[wasm_bindgen]
pub fn polygon_gate(x_vals: &[f32], y_vals: &[f32], vx: &[f32], vy: &[f32]) -> Vec<u8> {
    let n = x_vals.len().min(y_vals.len());
    let nv = vx.len().min(vy.len());
    let mut mask = vec![0u8; n];
    
    for i in 0..n {
        mask[i] = if point_in_polygon(x_vals[i], y_vals[i], vx, vy, nv) { 1 } else { 0 };
    }
    
    mask
}

fn point_in_polygon(x: f32, y: f32, vx: &[f32], vy: &[f32], nv: usize) -> bool {
    let mut inside = false;
    let mut j = nv - 1;
    for i in 0..nv {
        let xi = vx[i]; let yi = vy[i];
        let xj = vx[j]; let yj = vy[j];
        if (yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi {
            inside = !inside;
        }
        j = i;
    }
    inside
}
