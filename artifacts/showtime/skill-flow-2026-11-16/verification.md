# Showtime capture verification

The iPhone 17 Pro Simulator capture contains the real final assessment answer,
the completion wave, the Skills screen, the growth scene, and the reduction
of a second sector. The local WKWebView supplies the native shell and explicit
widths for the Skills layout. A separate PostgreSQL database supplied the
demo profile and the mentor score changes.

Visual review identified dropped source frames in the assessment wave. The
largest adjacent source timestamp gap during the wave was 0.658 seconds in
the main take and 1.135 seconds in the lower-resolution canvas rehearsal.
The main take also has a 0.300-second gap immediately before the decrease.
Normalizing to constant 60 fps does not restore the missing frames.

The 1920×1920, 60 fps edit passed the full FFmpeg format and tap-ring audit
in `render-quality.json`. The source motion finding still applies.

Delivery status: needs-new-capture. A continuous normal-speed and loop review
remains pending. Keep the original takes, event journals and crop settings for
a retake. Video length at native speed is approximately 23 seconds.

## Revised cut

The new simulator recording extends the web view to the bottom edge. The
purple wave reaches the lower corners in the encoded export. Two freezes in
the recorded wave were shortened by 1.1 seconds total. The camera eases
into a 1.34× focus over 2.4 seconds and returns to the full phone.
The revised 24.2-second MP4 passed the format, frame cadence and both tap
checks in `revision-quality.json`. The source capture still contains
missing frames within the wave.

## Full-width summary

Re-recorded against build `e348450`. Encoded frames show the summary and
skills panel aligned on both sides. The focus and bottom-edge treatment
are retained. The new MP4 passed the 60 fps and two-tap audit in
`summary-quality.json`. The edit shortens source holds by 2.43 seconds.
The simulator source still drops frames in the assessment wave.
