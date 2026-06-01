//! Compensation matrix multiply.
//!
//! Applies a spillover/compensation matrix to event data.
//! Input: flat Float32Array of events (n_events * n_channels).
//! Output: compensated events in-place.

use wasm_bindgen::prelude::*;

/// Apply compensation matrix to event data (in-place).
///
/// # Arguments
/// * `events` - Mutable flat event array [e0ch0, e0ch1, ..., e1ch0, ...]
/// * `matrix` - Row-major compensation matrix (n_channels * n_channels)
/// * `n_channels` - Number of channels
#[wasm_bindgen]
pub fn compensate(events: &mut [f32], matrix: &[f32], n_channels: u32) {
    let nc = n_channels as usize;
    let n_events = events.len() / nc;
    
    let mut buf = vec![0f32; nc];
    
    for e in 0..n_events {
        let offset = e * nc;
        // Matrix multiply: out[i] = sum_j matrix[i*nc + j] * event[j]
        for i in 0..nc {
            let mut sum = 0f32;
            for j in 0..nc {
                sum += matrix[i * nc + j] * events[offset + j];
            }
            buf[i] = sum;
        }
        events[offset..offset + nc].copy_from_slice(&buf);
    }
}
