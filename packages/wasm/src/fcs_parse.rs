//! FCS binary data parsing in Rust.
//!
//! Stub for future high-performance FCS parsing via WASM/sidecar.

use wasm_bindgen::prelude::*;

/// Parse FCS float32 event data from a byte slice.
#[wasm_bindgen]
pub fn parse_float32_events(data: &[u8], n_channels: u32, little_endian: bool) -> Vec<f32> {
    let nc = n_channels as usize;
    let n_floats = data.len() / 4;
    let mut events = vec![0f32; n_floats];
    
    for i in 0..n_floats {
        let bytes = [data[i*4], data[i*4+1], data[i*4+2], data[i*4+3]];
        events[i] = if little_endian {
            f32::from_le_bytes(bytes)
        } else {
            f32::from_be_bytes(bytes)
        };
    }
    
    events
}
