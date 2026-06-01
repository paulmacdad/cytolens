//! CytoFlow WASM — performance-critical computation for the browser.
//!
//! Modules:
//!   - logicle: FastLogicle transform lookup table generation
//!   - compensation: matrix multiply for spectral unmixing
//!   - gating: polygon point-in-polygon at millions of events/sec
//!   - density: 2D histogram binning for density plots

use wasm_bindgen::prelude::*;

pub mod logicle;
pub mod compensation;
pub mod gating;
pub mod density;

/// Library version
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
