use std::sync::atomic::{AtomicBool, Ordering};

static CANCELLED: AtomicBool = AtomicBool::new(false);

pub fn request_cancel() {
    CANCELLED.store(true, Ordering::SeqCst);
}

pub fn reset_cancel() {
    CANCELLED.store(false, Ordering::SeqCst);
}

pub fn is_cancelled() -> bool {
    CANCELLED.load(Ordering::SeqCst)
}
