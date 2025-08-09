/*
  Music Sequencer is a pattern that makes it easier to choreograph LEDs to
  songs that have steady tempos. It includes basic tempo detection for 4/4 
  beats and many helpers for making patterns more sound reactive.
  
  This version requires a sensor board and contains many example patterns.
  
    Demo: https://youtu.be/IjhYH3B7EI8
  
  Your sub-patterns can consume a variety of helpful duration timers.
  `currentPatternPct` and `phrasePct' ramp up like time(). `wholenote`, 
  `halfnote`, `beat`, `note_8', and `note_16` ramp down, from 1 -> 0.
  
  To use the sequencer, create a pattern sequence at the end of all other code.
  Do this by entering a series of `enqueue(beforeRenderer(), beatCount)`
  statements. Each beforeRenderer() function must set a renderer.
  
  A basic sequence might look like this:
    
    function party(delta) { renderer = (i) => <hsv() and stuff> }
    function stars(delta) { <beforeRenderStuff>; renderer = (i) => <hsv() and stuff> }
  
    setBPM(125)               // Set a manual tempo. `BPM = 125`
    setBeatsPerPhrase(16)     // Patterns can be phrase-aware
    enqueue(stars)            // 'stars' pattern for an entire phrase (16 beats)
    enqueue(party, 8)         // 8 beats of a pattern named 'party'
    enqueue(off, 4)           // All LEDs off for 4 beats
    exec(() => hue = .3)      // Instantly set global variable named hue
    enqueue(patternThatUsesHue)
    playUntilBeat(off, 16)    // Wait up to 16 beats with no LEDs on; start the
                              // next pattern in queue once a beat is detected.
    enqueue(stars)            // `stars` plays on-beat
                              // Now, sometime in the background, >=8 beats of a
                              // 4/4 tempo have been detected at 124 BPM.
    setBPMToDetected()        // Sets `BPM = 124`
    q(party)                  // q is shorthand for enqueue. Plays at 124 BPM.
    begin()                   // Required at the very end to start things.
  
  Tempo detection and frequency domain effects require the Pixelblaze sensor 
  expansion board. Sound paramaters have been tuned for use with the sensor 
  board's 3.5mm line-in jack. Results using the built-in mic will vary greatly
  by proximity and loudness. Visual params are set for SK9822 LEDs at 
  25%-of-max brightness.
  
  A note on the style: This pattern is a bit of an abuse of Pixelblaze.
  With all the demo patterns, it's well over 1200 lines. You may wish to
  start by folding all code sections, which is Alt-0 on Windows and 
  Command-Option-0 on Mac. Also, clarity has been sacrificed. Demo renderers
  are dense, preferencing fewer lines.

  Jeff Vyduna, 2021. MIT License.
*/


// IMPORTANT WARNING!!! PLEASE READ
/*
  This pattern was developed for Pixelblaze v3. Pixelblaze v3 can have
  up to 256 globals variables or functions. With the provided demo
  patterns, there's about 250 globals in use! Adding too many more 
  functions or variables will crash the board on firmware v3.18 and
  prior. v3.18 is the most recent v3 firmawre as of 9/6/21. It *will*
  crash if you add much more code to this pattern. Instead, start by 
  removing patterns, variables and functions you aren't using. For 
  example, if you aren't using an external sensor board, you can comment 
  out all `process<Sound>` functions and their preceeding vars to get
  back many globals for your use.
  
  Pixelblaze v2 can have up to 128 globals variables or functions, and
  will also crash above this as of the current version, v2.27. That 
  means that this pattern you're reading is DEFAULT-UNSAFE right now 
  for Pixelblaxe version 2 boards. In the pattern library, you can find 
  "Music Sequencer for v2" instead, which uses about 125 globals.
  
  With repeated crashes, boards can become difficult to recover - they 
  will try restarting with a previous pattern, then with no LED config, 
  and finally with no WiFi config. Please proceed with caution, and remove
  code for patterns you do not use before adding more code. I have bricked
  a Pixelblaze by getting into a state where crashing code is running 
  behind an unresponsive WiFi config. Recovery requires an additional 
  board and an involved reflashing procedure.
*/


// Values that come from the Sensor Board
// If this remains at the impossible value of -1, a sensor board is not connected.
export var light = -1
function SB() { return light != -1 }
export var frequencyData = array(32)
export var energyAverage, maxFrequency, maxFrequencyMagnitude


export function beforeRender(delta) {
  if(SB()) processSound(delta)
  updateTimers(delta)
  currentBeforeRenderer(delta)
}

var renderer
export function render(index) { render3D(index, index / pixelCount, 0, 0) }
export function render2D(index, x, y) { render3D(index, x, y, 0) }
export function render3D(index, x, y, z) {
  // `renderer()` will be reassigned by your patterns (every beforeRenderer)
  renderer(index, x, y, z);
}



// ************************************************************************
// * SOUND, BEAT AND TEMPO DETECTION                                      *
// ************************************************************************


function processSound(delta) {
  processVolume(delta)
  processInstruments(delta)
  inferTempo(delta)
}


// Volume normalization. EA = EnergyAverage, EMA = Exponential Moving Average
var EAThreshold = .02, maxEA = EAThreshold * 1.1, smoothedEA = EAThreshold, maxEATimer
export var localVolRatio = .5 // Ratio of instantaneous volume to recent average volume. Useful in pattern code.
export var volume = .25       // Volume 0..1. 0 = below EAThreshold, 1 = loudest heard in 80 seconds (accum in maxEATimer)

function processVolume(delta) {
  // EMA = k * thisSample + (1-k) * EMA; k = 2/(samples + 1); k=.02 -> 99 samples, 2.5 sec
  //                                                          k=.05 -> 40 samples, 1 sec
  // 120bpm 1B=.5s, 40hz = 20 samples minimum to span 4:4 beats
  var scaledEA = energyAverage << 4 // The empirical max I observed * 16 results in energyAverage scaled to roughly 1.5 for line-in, bass-heavy; .8-.9 typical for loud music on line in, or .6 for loud laptop right next to SB mic. 
  smoothedEA = .05 * scaledEA + .95 * smoothedEA // Exp Avg
  if (scaledEA >= maxEA) { maxEA = scaledEA; maxEATimer = 0 } // Max volume found. Reset timer.
  maxEATimer += delta / 10 //  Accumulate time since we've seen a max volume reading. 1 = 10ms.
  if (scaledEA > EAThreshold && maxEATimer >= 8000) maxEA *= .99 // Conservatively long period before reducing the loudest volume possible. Longer than any bridge. 80s ~= 5 phrases @120BPM.
  maxEATimer = min(8000, maxEATimer)
  
  // Compare to a silence threshold; if it's above silence, return a nonzero ratio. E.g. `if (localVolRatio > 1.5) burst()`. Fast moving (40Hz, same as sensor board)
  localVolRatio = scaledEA > EAThreshold && scaledEA / smoothedEA
  volume = scaledEA > EAThreshold && smoothedEA / maxEA //  Smoothed volume 0..1; 1 = loudest heard in the last 80 seconds
  
  // You can queue something that skips to the next one when volume spikes. If detected, start the next pattern and skip some ms in to correct for the estimated time it took to detect this volume spike.
  if (continueMode == 2 && volume > .8) next(40)
}

// Debounced detectors
{  // Brackets are used at times to enable code folding in the editor.
var minBeatRetrigger = .2 // How much of a currently defined quarter note beat must pass before a detected instrument will retrigger? E.g. use .2 to allow .25 retrigger (e.g. to catch sixteenth note drums)
var beatTimerIdx = 0, clapsTimerIdx = 1, hhTimerIdx = 2
var debounceTimers = array(3)
var beatsToMs = (_beats) => 1000 / BPM * 60 * _beats
debounceTimers.mutate(() => beatsToMs(minBeatRetrigger))
}
function debounce(trigger, fn, timerIdx, duration, elapsed) {
  if (trigger && debounceTimers[timerIdx] <= 0) { 
    fn()
    debounceTimers[timerIdx] = duration
  } else { 
    debounceTimers[timerIdx] = max(-3e4, debounceTimers[timerIdx] - elapsed)
  }
}

var hh, hhEMA = .1, hhOn     // High hat. Frequencies ~ 9KHz
var claps, clapsEMA = .1, clapsOn  // Claps frequencies
var bass, maxBass, bassOn    // Bass and beats
var bassSlowEMA = .001, bassFastEMA = .001 // Exponential moving averages to compare to each other
var bassThreshold = .02      // Raise this if very soft music with no beats is still triggering the beat detector
var maxBass = bassThreshold  // Maximum bass detected recently (while any bass above threshold was present)

// Redefine these in your patterns to do something that reacts to these instruments
function beatDetected() {}
function clapsDetected() {}
function hhDetected() {}

var hhThreshold = 2
// Uncomment to tune the high hat detection threshold
// export function sliderHighhatThreshold(_v) { hhThreshold = _v * 4 }
function processInstruments(delta) {
  hh = (frequencyData[29] + frequencyData[30]) << 4 // Readings in these bins are typically so low that *16 gives the EMA more headroom
  hhOn = hh > hhThreshold * hhEMA // hhOn, clapsOn, and bassOn can be true for multiple frames, unlike hhDetected(), clapsDetected(), beatDetected(), which will be debounced and called only once per event.
  debounce(hhOn, hhDetected, hhTimerIdx, beatsToMs(minBeatRetrigger), delta)
  hhEMA = .02 * hh + .98 * hhEMA
  
  claps = 0; for (i = 18; i <= 24; i++) claps += frequencyData[i] << 4
  clapsOn = claps > 3 * clapsEMA
  debounce(clapsOn, clapsDetected, clapsTimerIdx, beatsToMs(minBeatRetrigger), delta)
  clapsEMA = .02 * claps + .98 * clapsEMA

  // Assume Sensor Board updates at 40Hz (25ms); Max BPM 180 = 333ms or 13 samples; Typical BPM 500ms, 20 samples
  // Kickdrum fundamental 40-80Hz. https://www.bhencke.com/pixelblaze-sensor-expansion
  bass = frequencyData[1] + frequencyData[2] + frequencyData[3]
  maxBass = max(maxBass, bass)
  if (maxBass > 10 * bassSlowEMA && maxBass > bassThreshold) maxBass *= .99 // AGC - Auto gain control
  
  bassSlowEMA = (bassSlowEMA * 999 + bass) / 1000
  bassFastEMA = (bassFastEMA * 9 + bass) / 10
}



var bassVelocitiesSize = 5 // 5 seems right for most. Up to 15 for infrequent bass beats (slower reaction, longer decay), down to 2 for very fast triggering on doubled kicks like in drum n bass
var bassVelocities = array(bassVelocitiesSize) // Circular buffer to store the last 5 first derivatives of the `fast exponential avg/MaxSample`, used to calculate a running average
var lastBassFastEMA = .5, bassVelocitiesAvg = .5
var bassVelocitiesPointer = 0 // Pointer for circular buffer

// Store the last 8 intervals between beats. Longest = 50BPM on beat 1 (4800 ms = 60 / 50BPM * 1000 * 4)
var beatIntervalSamples = 8, beatIntervalPtr = 0, beatIntervalTimer = 0
var beatIntervals = array(beatIntervalSamples)

function inferTempo(delta) {
  bassVelocities[bassVelocitiesPointer] = (bassFastEMA - lastBassFastEMA) / maxBass // Normalized first derivative of fast moving expo avg
  bassVelocitiesAvg += bassVelocities[bassVelocitiesPointer] / bassVelocitiesSize
  bassVelocitiesPointer = (bassVelocitiesPointer + 1) % bassVelocitiesSize
  bassVelocitiesAvg -= bassVelocities[bassVelocitiesPointer] / bassVelocitiesSize
  bassOn = bassVelocitiesAvg > .51 // `bassOn` is true when bass is rising
  
  debounce(bassOn, beatDetectedWrapper, beatTimerIdx, beatsToMs(minBeatRetrigger), delta)
  beatIntervalTimer += delta
  // Longest = 50BPM on beat 1 (4800 ms = 60 / 50BPM * 1000 * 4)
  if (beatIntervalTimer > 5000) beatIntervalTimer = 5000 // No-beat ms threshold to reset beat detection 
  
  lastBassFastEMA = bassFastEMA
}

function beatDetectedWrapper() {
  if (beatIntervalTimer >= 5000) { // Clear beat intervals, it's been too long since a beat
    beatIntervals.mutate(() => 0)
    beatIntervalTimer = beatIntervalPtr = 0
  }
  beatIntervals[beatIntervalPtr] = beatIntervalTimer
  beatIntervalTimer = 0
  beatIntervalPtr = (beatIntervalPtr + 1) % beatIntervalSamples
  if (beatIntervals[0] != 0) estimateBPM() // We have all 8 beatIntervalSamples, so estimate tempo

  // You can queue a pattern that skips to the next one when when a beat drops. If a beat dropped, start the next pattern and skip 50-250ms (depending on beat detection settings) in to correct for the estimated time it took to detect this beat.
  if (continueMode == 1) next(120)

  beatDetected() // Calls a function that can be user-defined in patterns
}



export var BPMEst = 0, BPMEstReliable = 0 // Last successfully estimated tempo, and a boolean for whether it is currently thought to still be ccurate
var meanBeatInterval = 0 // Global just so it can be used in arrayReduce() below
function estimateBPM() {
  meanBeatInterval = beatIntervals.sum() / beatIntervalSamples
  
  var errSum = beatIntervals.reduce((a, v) => {
    var diff = (v - meanBeatInterval) / 100 // Range precision: scale the samples down by /= 100 before summation
    return a + diff * diff
  }, 0)
  
  var stdDev = sqrt(errSum / beatIntervalSamples) / (meanBeatInterval / 100)
  if (stdDev < .1) { 
    BPMEst = 6000 / (meanBeatInterval / 10)  // 60,000 ms in a minute. Done this way to prevent overflow.
    BPMEst = round(BPMEst) // Optional - Most non-live music is released with integer BPM tempo. If syncing to live performance / turntable DJs, comment this out.
    BPMEstReliable = 1
  } else {
    BPMEstReliable = 0
  }
}






// ************************************************************************
// * PATTERN AND COMMAND QUEUE                                            *
// ************************************************************************


export var BPM = 120        // Nominal BPM. Can be set mid-sequence with setBPM(bpm) or setBPMToDetected()
var SPB                     // Inferred "seconds per beat" from BPM
var beatsPerMeasure = 4
var beatsPerPhrase = 32     // A phrase is the default duration in beats when `enqueue(pattern)` is called with no second argunment for duration.
var currentPatternMs = 0    // ms into the current pattern, wrapped back to 0 after 32000 ms
var currentPatternS = 0     // Seconds into the current pattern
var currentPatternDuration = 0  // Current pattern's total duration, in seconds
var currentPatternBeats = 0     // Current pattern's total duration, in beats
var currentPatternPct = 0       // 0..1 like time(), this is the percentage of the current pattern that has run
var beatCount                   // Number of beats into the current pattern, as an increasing decimal counter
var phrasePct                   // Percent into the current phrase, as defined by beatsPerPhrase

// Percent remaining in wholenote, halfnote, beat (quarternote), 8th, 16th, and measure (as defined by `beatsPerMeasure`)
// These go from 1 to 0 and jump back suddently to 1 on the next interval, I.E., they have the opposite ramp as `time()`, `currentPatternPct`, and `phrasePct`
var measure, wholenote, halfnote, beat, note_8, note_16 
var currentBeforeRenderer       // A reference to the current pattern's beforeRender() equivalent. This is always called in beforeRender, and it should set `renderer` to a function like render3d(i, x, y, z)
var totalPatternCount = 0       // `enqueue()` increments this as patterns are added to the queue
var currentPatternIdx = 0             // Main index for the queue (which pattern is currently playing).
var beforeRendererQueue = array(256)  // This is the main pattern queue, storing beforeRenderers()
var durationQueue = array(256)        // Stores the duration for each corresponding pattern in beforeRendererQueue, in units of beats. Otherwise, for commands (immediate single execution), the entry is an argument passed to the function.
var continueModeQueue = array(256)    // Modality for when to proceed to the next entry in the queue
var continueMode                      // 0: Continue after a specified duration.  1: After beat detected or the duration.  2: After volume spikes or the duration.  9: Execute once immediately and proceed.


// enqueue(BRFn) - Add an action (a pattern, delay, or command) to the queue. Aliased as `q(BRFn)`.
/*
  BRFn: A beforeRender(delta) function. It should assign a `renderer = (index, x, y, z) => {}`
        If continueMode == 9, this is a command function that will be executed once, after which the queue proceeds

  _beats: The duration this renderer will execute for, in beats at the current BPM
          If continueMode == 1 or 2, the pattern may plan for less time if an audio condition is detected from an attached sensor board
          if continueMode == 9, this value will be passed as an argument to the command function

  continueMode: 0 - Proceed to the next pattern or command in the queue once the duration has expired
                1 - Like 0, but if a bass pulse is detected, then proceed to the next pattern early
                2 - Like 0, but if a volume spike is detected, such as from silence to any sound, then proceed to the next pattern early
                3-8 - Reserved for future use
                9 - Execute BrFn() once immediately with _beats passed as an argument, then proceed
                Anything else - expect a function reference. Execute the function and proceed if it evaluates truthy.
*/

function enqueue(BRFn, _beats, continueMode) {
  beforeRendererQueue[totalPatternCount] = BRFn
  durationQueue[totalPatternCount] = _beats
  continueModeQueue[totalPatternCount] = continueMode
  totalPatternCount++
}
q = enqueue     // Shorthand you'll appreciate when using this a lot

// Queue a pattern that will be played until either the duration expires, or a beat is detected
function playUntilBeat(BRFn, _beats) {
  enqueue(BRFn, _beats, 1)
}

// Queue a pattern that will be played until either the duration expires, or the volume spikes
function playUntilLoud(BRFn, _beats) {
  enqueue(BRFn, _beats, 2)
}

// These are "commands" in that they may a change to a global like the BPM tempo, but execute once instantly instead of for a specified duration.

// Shorthand to enqueue the one-time execution of a function at that point in the queue
function exec(fn, argument) {
  if (argument == 0) {
    enqueue(fn, null, 9)
  } else {
    enqueue(fn, argument, 9)
  }
}

// Note: setBPM(<30) screws up beat detection, missing beats. It's complicated why, and isn't worth refactoring for.
function setBPM(_bpm) {
  enqueue((__bpm) => BPM = __bpm, _bpm, 9)
}

function setBPMToDetected() {
  enqueue((_) => BPM = BPMEst || BPM, null, 9)  // Keep the previously specified BPM if none is detected
}

function setBeatsPerPhrase(_bpp) {
  enqueue((__bpp) => beatsPerPhrase = __bpp, _bpp, 9)
}

// This can be used as a command in queue to calibrate for bass when there hasn't been time to baseline the various autmatic gain controls. Helps initial beat detection. Set higher for inputs with high volume, such as full line-in.
function expectBass(bassLvl) {
  exec((_bassLvl) => { maxBass = _bassLvl; bassSlowEMA = maxBass / 2 }, bassLvl)
}

// updateTimers() is called in beforeRender(). Updates timers that patterns can use, like 
// `beat` (% of beat remaing), etc. Also determines when a pattern is complete and it's 
// time to go to the next thing in the queue.
var ONE_MINUS_EPSILON = (0xFF >> 16) + (0xFF >> 8) // One minus the smallest number. Highest result of `x % 1`.

function updateTimers(delta) {
  currentPatternMs += delta
  if (currentPatternMs > 32000) { currentPatternMs -= 32000 }
  currentPatternS += delta / 1000
  if (currentPatternS >= currentPatternDuration) next()
  currentPatternPct = currentPatternS / currentPatternDuration

  SPB = 60 / BPM  // Seconds per beat
  beatCount = currentPatternS / SPB
  phrasePct = currentPatternS / (beatsPerPhrase * SPB) % 1
  measure = ONE_MINUS_EPSILON - currentPatternS / (beatsPerMeasure * SPB) % 1
  wholenote = ONE_MINUS_EPSILON - currentPatternS / (4 * SPB) % 1
  halfnote = 2 * wholenote % 1
  beat = 4 * wholenote % 1
  note_8 = 8 * wholenote % 1
  note_16 = 16 * wholenote % 1
}

// Code to run once between patterns to reset shared state
function beforeNext() {
  // Clear shared variables
  for (i = 0; i < pixelCount + 1; i++) {
    hArr[i] = 0; sArr[i] = 1; vArr[i] = 0
  }
  setupDone = 0    // Allow any setup block defined to execute once
  lastTrigger = -1 // Clear the rising/falling edge trigger
  beatDetected = clapsDetected = hhDetected = () => {}  // Unassign any instrument-reactive functions
}

// Start the next pattern in the queue, beginning `startAtMs` milliseconds into it (usually 0)
function next(startAtMs) {
  beforeNext()
  
  currentPatternMs = startAtMs
  currentPatternS = currentPatternMs / 1000
  currentPatternIdx++
  
  if (currentPatternIdx >= totalPatternCount) {
    loop() // Specify your desired ending behavior here -- loop(), halt(), or repeatLast()
    return
  }
  
  currentPatternBeats = durationQueue[currentPatternIdx]
  continueMode = continueModeQueue[currentPatternIdx]
  
  if (continueMode <= 2) { // Run pattern for specified duration (0) or until beat detected (1) or until volume spikes (2)
    currentBeforeRenderer = beforeRendererQueue[currentPatternIdx]
    currentPatternBeats = currentPatternBeats || beatsPerPhrase
    currentPatternDuration = currentPatternBeats * 60 / BPM
  } else if (continueMode == 9) { // Run function once with an argument
    beforeRendererQueue[currentPatternIdx](currentPatternBeats) 
    next()
  } else if (continueMode()) { next() } // Otherwise expect a function that will evaluate truthy to proceed
}

function halt() { beforeRender = (d) => { renderer = (i,x,y,z) => { hsv(0,0,0) } } }
function loop() { begin() }
function repeatLast () { currentPatternIdx-- }

function begin() { // This must appear at the very end of the sequence / queue definition, usually the last line of the entire pattern
  currentPatternIdx = -1
  next()
}







// ************************************************************************
// * YOUR PATTERNS                                                        *
// ************************************************************************


//  SHARED VARIABLES that multiple patterns might use

var setupDone = 0 // Use to run something once for setup. `if (!setupDone) { a = 0; setupDone = 1 }`

var hArr = array(pixelCount + 1) // An extra value avoids index errors in interpolation loops
var sArr = array(pixelCount + 1)
var vArr = array(pixelCount + 1)

var themeHue     // A theme hue that multiple patterns can consume
var direction    // If a pattern can be reversed, it can read this global variable to determine direction

// PI Controller for automtic gain control
var targetFill = 0.2         // Set this in your pattern
var brightnessFeedback = 0   // Accumulates final v values from output
var sensitivity = 0          // The calculated gain to reduce error against the goal
var pic = makePIController(.25, .15, 20, 0, 1000)

function makePIController(kp, ki, start, min, max) {
  var pic = array(5)
  pic[0] = kp; pic[1] = ki; pic[2] = start; pic[3] = min; pic[4] = max
  return pic
}

function calcPIController(pic, err) {
  pic[2] = clamp(pic[2] + err, pic[3], pic[4])
  return max(pic[0] * err + pic[1] * pic[2], 0)
}



// HELPERS - Code that multiple patterns might use

// Return a more perceptually rainbow-ish hue
function fixH(pH) {
  return wave((mod(pH, 1) - .5) / 2)
}

// Returns 1 when a & b are proximate, 0 when they are more than `halfwidth`
// apart, and a gamma-corrected brightness for distances within `halfwidth`
function near(a, b, halfwidth) {
  if (halfwidth == 0) halfwidth = .125
  var v = clamp(1 - abs(a - b) / halfwidth, 0, 1)
  return v * v
}

// Returns an integer where A4 (440Hz) is 12. (C4 is middle C, 3). For a sine wave,
// semitones above C5 (return value of 15) are reliably distinguishable.
// So - you know, flute solo.
var noteNum
function detectNote() {
  return round(12 * log2(maxFrequency / 220))
}

// Reduce all vArr[] exponentially, where 1.0 decays to 0.0001 in ~`seconds`
function decay(seconds, delta) {
  delta = delta || 3 // Test result: delta is 3 ms for 320FPS on v3 with 128 LEDs
  var decayCoeff = pow(2, log2(.99) * delta / seconds / 2)
  for (i = 0; i < vArr.length; i++) vArr[i] *= decayCoeff
}

// Execute fn once upon detection of a rising (default) or falling edge
var lastTrigger = -1
function triggerOn(t, fn, onFalling) {
  if (lastTrigger == -1) lastTrigger = onFalling
  if (lastTrigger != t && (onFalling ^ t > lastTrigger)) fn()
  lastTrigger = t 
}

// Various blending modes
var mixedH, mixedV
// Add two hue, value vectors assuming full saturation. 
// https://math.stackexchange.com/questions/1365622/adding-two-polar-vectors
// This is slightly faster than doing it via cartesian conversion
function mixHV(h1, v1, h2, v2) { 
  v1 = clamp(v1, 0, 1); v2 = clamp(v2, 0, 1)
  var cosHues = v2 * cos((h2 - h1) * PI2)
  mixedV = sqrt(v1 * v1 + v2 * v2 + 2 * v1 * cosHues)
  mixedH = h1 + atan2(v2 * sin((h2 - h1) * PI2), v1 + cosHues) / PI2
}



// RENDERERS

// For the demo version of this pattern, these are very dense to reduce LOC. Sorry.

function off(delta) { renderer = (i, x, y, z) => hsv(0, 0, 0) }


// Red progress meter for the duration it's enqueued for, but also pulses to quarter notes
function progress(delta) {
  renderer = (i, x, y, z) => {
    var pct = direction > 0 ? i / pixelCount : 1 - i / pixelCount
    hsv(themeHue, 1, beat * (currentPatternPct > pct))
  }
}


// Progress meter for one measure
function measureProgress(delta) {
  renderer = (i, x, y, z) => {
    var pct = direction > 0 ? i / pixelCount : 1 - i / pixelCount
    hsv(themeHue, 1, beat * (measure > pct))
  }
}


// Sweep a pulse across the strip to the beat
function sweep(delta) { 
  renderer = (i, x, y, z) => {
    var pct = direction > 0 ? i / pixelCount : 1 - i / pixelCount
    hsv(themeHue, 1, near(pct, beat))
  }
}


function quarters(delta) {
  renderer = (i, x, y, z) => { hsv(themeHue - .02 * triangle(i / pixelCount), 1, beat * triangle(i / pixelCount)) }
}


function eiths(delta) { 
  renderer = function(i, x, y, z) { 
    var positionEith = floor(8 * i / pixelCount)
    var measureEith = floor(8 * measure)
    var v = (positionEith == measureEith) * note_8
    hsv(.05 + themeHue - measure / 10, sqrt(sqrt(3 * measure - 1)), v * v)
  }
}

var flash
function strobe() {
  flash = note_16 > .8
  renderer = (index, x, y, z) => { hsv(0, 0, flash) }
}


// Colors eminante from the center and withdraw quickly every 2 beats
var halfnoteEMA = 0
function halfSurge(delta) {
  halfnoteEMA = .9 * halfnoteEMA + .1 * halfnote
  renderer = (index, x, y, z) => { 
    var pct = 3 * (index / pixelCount - .5)
    var v = abs((phrasePct - sqrt(currentPatternPct) * halfnoteEMA / 5) * 4 / sqrt(pct) % 1)
    hsv(fixH(v / (4 - 3 * currentPatternPct) - .6), 1, v * v * triangle(index / pixelCount))
  }
}


var pos
function dancingPixel(delta) { 
  var s8 = square(note_8, .25) / 15
  var w444 = wave(beat) * wave(beat) * wave(beat) / 8
  var cWP = .1 + .8 * wave(currentPatternPct)
  var sqJitter = s8 * (1 - currentPatternPct)
  var bassDance = currentPatternPct * currentPatternPct * (bassFastEMA / maxBass) / 4
  pos = cWP + currentPatternPct * w444 + sqJitter + bassDance
  renderer = renderDancingPixel
}
function renderDancingPixel(i, x, y, z) {
  var width = bassFastEMA / maxBass / 2 * square(currentPatternPct - .5, .125)
  var v = near(pos, i / pixelCount, width)
  hsv(fixH(themeHue - .53 * (currentPatternPct > .5) ), 1, v * v) 
}


// Fake bass 1D oscilliscope - 2 beats
function halfnoteBassHit(delta) {
  var bassDFreq = .6 * wave((5 + 5 * halfnote) * halfnote) - .3
  pos = .5 + bassDFreq * pow(halfnote, 3) // Bassdrum freq * amplitude decay
  baseH = .15 * (1 - currentPatternPct)
  
  renderer = (i, x, y, z) => {
    v = near(pos, i / pixelCount)
    hsv(fixH(baseH - v / 8), 1, v * v)
  }
}


// Fake bass 1D oscilliscope
function bassScope() { 
  var bassDFreq = .6 * wave((10 + 20 * beat) * beat) - .3
  pos = .5 + bassDFreq * pow(beat, 3) // Bassdrum freq * amplitude decay
  width = triangle(currentPatternPct)
  width = .05 + width * width * width
  baseH = 1 - currentPatternPct * floor(measure * beatsPerMeasure) / beatsPerMeasure
  renderer = (i, x, y, z) => {
    v = near(pos, i / pixelCount, width)
    hsv(fixH(baseH - v / 6), 1, v * v)
  }
}


// Paint Fizzle: 1D Texture brush. Best in hip hop / uneven beats.
var paintPtr, paintStart, paintLen, paintArrPtr, paintHue
function paintFizzle(newFizzle) {
  var paintMinLen = pixelCount/10
  if (newFizzle) {  // || abs(paintPtr - paintStart) >= abs(paintLen)) { // Uncomment the remainder for use with songs that don't have beats (and consider reducing paintMinLen)
    paintHue = time(10 / 65.536) + (random(1) > .5 ? 0 : .15)
    paintPtr = paintArrPtr = paintStart = mod(paintStart + 2 * paintMinLen + random(pixelCount - 3 * paintMinLen), pixelCount)
    paintLen = (paintMinLen + random(pixelCount - paintMinLen)) * (random(1) > .125 ? paintLen/paintLen : -paintLen/paintLen) // Signed direction. Baysean.
    vArr[paintStart] = random(1); hArr[paintStart] = fixH(paintHue)
  }

  for (i = 0; i <= newFizzle * paintMinLen; i++) { // Do once, unless newFizzle
    paintLen > 0 ? paintPtr++ : paintPtr--
    prevPtr = paintArrPtr
    var paintArrPtr = mod(paintPtr, pixelCount)
    vArr[paintArrPtr] = .1 + random(.2)
    if (vArr[prevPtr] > .5 ^ .8 > random(1)) vArr[paintArrPtr] += .3 + random(.5) // 80% chance that every other pixel is bright (but all are still random)
    hArr[paintArrPtr] = fixH(paintHue)
  }
}
var newPainter = () => paintFizzle(1)

function fizzleGrains(d) {
  decay(clamp(1 / (volume + .1), .1, 10), d) // If low volume, decay slower
  
  beatDetected = newPainter
  // Select parameters for other sound that will build a fizzle started by a bass note
  if (claps > 1.5 * clapsEMA) paintFizzle()
  // if (hh > 2 * hhEMA) paintFizzle()
  // if (localVolRatio > 1.3 || volume > .7) paintFizzle()

  renderer = (i, x, y, z) => { 
    var shimmer = .7 + .3 * wave(i / 6 + time(0.1 / 65.536)) 
    hsv(hArr[i], vArr[i] < .8, vArr[i] * vArr[i] * shimmer)
  }
}


// Flash random segments faster and faster during a build
var segmentsOn, segmentCount, beatsRemaining, flash = 0
function buildupSegments() {
  beatsRemaining = currentPatternBeats - beatCount
  segmentCount = pow(2, 5 - ceil(max(0, log2((beatsRemaining - 4))))) + 2
  if (beatsRemaining < 4) { flash = note_16 > .8 || note_16 < .1 }
  else if (beatsRemaining < 8) { flash = note_8 > .8 || note_8 < .1 }
  else { flash = beat > .8 }
  triggerOn(flash, () => {
    segmentsOn = random(32768) 
    if (segmentCount <= 6) { // Ensure at least 1 segment is on
      while (((segmentsOn << 16) & (pow(2, segmentCount) - 1)) == 0) { 
        segmentsOn = random(32768)
      }
    }
  })

  renderer = (index, x, y, z) => {
    var segmentDec = segmentCount * index / pixelCount
    var segmentNum = floor(segmentDec)
    var spacer = index % (pixelCount / segmentCount) > 1
    var v = ((segmentsOn >> segmentNum) & (flash >> 16) ) << 16
    var h = .2 + phrasePct + triangle(segmentDec % 1) / 8
    hsv(h, beatsRemaining >= 2, v * spacer) // White last 2 beats
  }
}
  

// 80s ish thing. Flashing photosensitivity warning. 
function hyper(delta) {
  renderer = (index, x, y, z) => {
    var sat = 1
    var pct = index / pixelCount
    if (beatCount > 18) pct = 1 - pct
    var sweepIn = pct - clamp((4 - beatCount) / 4, 0, 1) + max(0, 1 - abs(beatCount - 16) / 2)
    var pulse = 8 * sweepIn * sweepIn * (.5 + sweepIn) + beat * (sweepIn > 0)
    
    if (pulse > 1) { // Modulate the furthest ones blinking to loudness
      pulse = pulse % 1 * (1 - pct * pct * (note_16 * (localVolRatio - .8) % 1 > .25))
    } else { // White flashes for first pulse
      sat = note_16 > .5
    }
    hsv(floor(beatCount / 8) * .166 -.166 * (beatCount > 18), sat, pulse)
  }
}


// Parrallax: A world of particles at varios distances
//   Diagram: https://take.ms/iy5bJ
{
var plxParticleCount = 20
var plxParticleOffsets = array(plxParticleCount)
plxParticleOffsets.mutate(() => random(1))
var plxFocalLen = pixelCount * 6
var plxObjecMaxD = pixelCount * 10
var plxObjectMaxH = pixelCount / plxFocalLen * plxObjecMaxD
var plxWindowDepth = 1.5 * plxFocalLen
}
function parallax(delta) {
  var t1 = phrasePct // Base position before indivdual offsets
  // Introduct the back-and-forth motion
  if (currentPatternPct > .5) t1 += wave(8 * phrasePct) / 8 * 2 * (currentPatternPct - .5)
  decay(.2, delta)

  for (i = 0; i < plxParticleCount; i++) {
    var particleX = plxObjectMaxH * ((t1 + plxParticleOffsets[i]) % 1)
    var distance = plxObjecMaxD - plxWindowDepth * i / plxParticleCount // plxObjecMaxD - plxWindowDepth * `nearness`
    var projectedPosition = particleX / distance * plxFocalLen
    var height = 3 * plxFocalLen / distance
    var start = max(0, projectedPosition)
    var end = min(pixelCount - 1, projectedPosition + height)
    var hue = phrasePct + .63 - i / plxParticleCount / 5
    for (index = start; index < end; index++) {
      hArr[index] = hue
      sArr[index] = sqrt(1 - (index - start) / (end-start))
      vArr[index] = .9
    }
  }
  
  renderer = (i, x, y, z) => { hsv(hArr[i], sArr[i], vArr[i]) }
}


// Raindrops splashing on the ground in front of you
{
var dropCount = 4
var dropsX = array(dropCount)        // Current position of each drop, in pixels from index 0
var dropsNearness = array(dropCount) // 0 for 80m away, 1 for drops right next to the viewer
var dropsGroundX = array(dropCount)  // Cached position where the drop will splash on the ground, in pixels from index 0
var dropSplashes = array(pixelCount) // Blue pixels for the splashes 
var splashH = (t, p) => max(0, 4 * t * (sqrt(p) / p - t)) // Splash height as a fn(time, parameter) - https://www.desmos.com/calculator/iwurasjyu9
}
function newDrop(close) {
  for (i = 0; i < dropCount; i++) {
    if (dropsX[i] == 0) { 
      dropsX[i] = 1
      dropsNearness[i] = 1 - random(1) / (1 + close * 3)
      // Given a nearness, return X, the pixel index where a drop hits the ground and splashes. This ratio assumes the strip
      // is a 24mm tall image plane, 50mm focal length, drops are randomly distributed between right next to you and 80m away
      dropsGroundX[i] = pixelCount / 2 + pixelCount / 19.2 / (1 - dropsNearness[i])
      break
    }
  }
}
function newDropClose() { newDrop(1) }

function rain(delta) {
  if (!setupDone) { 
    dropSplashes.mutate(() => 0)
    dropsX.mutate(() => 0)
    setupDone = 1
  }
  
  if (SB()) { // Sensor board: New raindrops on beatDetected()
    beatDetected = newDropClose
    clapsDetected = newDrop

    if (beatIntervalTimer / 1000 > 8 * SPB) { // If 8 beats of silence passed, rain randomly
      if (random(800) < delta) newDrop() 
    }
  } else { if (random(400) < delta) newDrop() }
  
  for (i = 0; i < dropCount; i++) {
    if (dropsX[i] > 0) { // Drop is active
      if (dropsX[i] >= 1.3 * pixelCount) { dropsX[i] = 0; continue } // Recycle a drop because it's well past the image plane
      var pastGround = dropsX[i] - dropsGroundX[i]
      if (pastGround > 0) {
        splashAnimPct = pastGround / (pixelCount / 4)
        dropsX[i] += delta / 24 // Speed for splash animation doesn't depend on nearness
        if (splashAnimPct >= .9) { dropsX[i] = 0; continue } // Recycle drop when done splashing
        for (n = 0; n <= 3; n++) { // Compute X for each of 4 splashing pixels 
          splashPixel = clamp(dropsGroundX[i] - dropsNearness[i] * 20 * splashH(splashAnimPct, sqrt(pow(2, n))), 0, pixelCount - 1)
          dropSplashes[splashPixel] = dropsNearness[i] * dropsNearness[i] * (1 - splashAnimPct)
        }
      } else {
        // Drop is still falling. Near drops appear to be falling faster through the image plane.
        dropsX[i] += delta * (.1 + .4 * dropsNearness[i])
      }
    }
  }

  renderer = (index, x, y, z) => {
    index = pixelCount - 1 - index
    if (index < pixelCount / 2) { // Top half of strip is cloudy sky
      var skyV = .05 + .1 * index / pixelCount
      hsv(.05, 0.7, skyV * skyV)
    }
    var maxV = 0 // Since closer drops are brighter, this layers overlapping drops properly
    for (i = 0; i < dropCount; i++) {
      if ( index < dropsX[i] // Skips inactive drops where dropsX[i] == 0
        && index > (dropsX[i] - 20 * dropsNearness[i]) // The tail is 0-20 pixels following dropX 
        && index < dropsGroundX[i] ) // Part above the ground
          maxV = max(maxV, .2 + .8 * dropsNearness[i])
    }
    if (maxV > 0) hsv(0, 0, maxV * maxV) // White falling drips
    if (dropSplashes[index]) { // Blue splashes
      hsv(.55, .8, dropSplashes[index])
      dropSplashes[index] = 0
    }
  }
}


// Flashes patches of _W_W_W_ and _RB_RB_RB_
function fillRB(x, l) {
  for (i = x; i < x + l; i++) {
    hArr[i] = .66 * (i % 3 == 0)
    sArr[i] = 1
    vArr[i] = i % 3 != 1
  }
}
function fillDots(x, l) {
  for (i = x; i < x + l; i++) { vArr[i] = i % 2 == 1; sArr[i] = !vArr[i] }
}
function fillBlue(x) { hArr[x] = .5; vArr[x] = random(.3) }
function flashSieves(delta) {
  decay(localVolRatio ? 1 : 9, delta)
  length = floor(random(.2 * pixelCount))
  start = floor(random(pixelCount - length))
  if (localVolRatio > 2 ) fillRB(start, length)
  if (localVolRatio > 1.3 && random(10) < 1) fillDots(start, length) 
  if (localVolRatio == 0 && random(20) < 1) fillBlue(floor(time(.001) * pixelCount)) 
  renderer = (i, x, y, z) => { hsv(hArr[i], sArr[i], vArr[i]) }
}


// Detect notes, plot piano. Try with a flute solo. See freq limits on detectNote().
var fade, pixPerNote
function piano(delta) {
  if (!SB()) next() // Pattern is trivial without SB
  fade = min(beatCount / 4, min(1, (currentPatternBeats - beatCount) / 4)) // Fade in and out
  fade *= fade
  var pianoNotes = 3 * 12; pixPerNote = pixelCount / pianoNotes
  noteNum = mod(detectNote() - 12, pianoNotes) // Accurate for noteNums > 14; plots all noteNums with rollover
  if (maxFrequencyMagnitude < .05) noteNum = -1 // Threshold seems to work for mic and line in
  decay(.2, delta)
  
  renderer = (i, x, y, z) => {
    var note = i / pixPerNote
    var isNatural =  (0b010110101101 >> (floor(note) % 12)) & 1
    hsv(.06, .7, isNatural * (.02 + .1 * (clapsOn || hhOn)) * fade) // Black accidentals, dim naturals
    if (!floor(i % pixPerNote)) hsv(.05, .7, (.2 + bassFastEMA / maxBass) * fade) // Piano key dividers
    if (note > noteNum && note < noteNum + 1) { // Detected note
      hArr[i] = fixH(noteNum / 12)
      vArr[i] = .1  + 3 * maxFrequencyMagnitude
    }
    if (vArr[i] > .02) hsv(hArr[i], 1, vArr[i] * fade) // Render detected note
  }
}
 

// Low budget Pacifica - not actually sound reactive
var ptrBase, t1, t2, fade, hueDrift
function prifika(delta) {
  fade = min(beatCount / 4, 1); fade *= fade
  hueDrift = max(0, (beatCount - 16) / 64)
  ptrBase += delta >> 12 // Provides additional offset panning for one of the waves
  t1 = time(.1)
  t2 = triangle(pow((currentPatternS + 7.7) / 15.0733 % 1, 7)) // White pulse, sync'd to arbitrary demo
  renderer = (i, x, y, z) => {
    var pct = i / pixelCount
    var s = wave(10 * (pct/8 - t2)) * square(pct/8 - t2 + .125, .1)
    s *= s*s // White pulse
    pct = 2 * (pct - .5) // Scale
    var w1 = .5 * wave(2 * pct + t1 + ptrBase) - .03
    var w2 = .5 * wave(2.3 * pct - t1) - .03
    var w3 = wave(1.7 * pct - t1 - .25)
    var w4 = wave((1 + 3 * wave((t1 / 2 - 1)* t1)) * pct + 2 * t1 - .25)
    var w5 =  wave(1.1 * pct - t1 - .25 - ptrBase/2.3) / 2 - .25
    var v = w1 + w2 + w4/2 + s + w5
    
    hsv(themeHue + hueDrift + .1 * w3 - .1 * w4, sqrt(1-s), v * v * v * fade * volume)
  }
}


// Gradients that posterize quickly into segments
// Creates segments by detecting zero-crossings in this: https://www.desmos.com/calculator/9z8twmylka
function gapGen(x, p) { return (wave(x/5/p)*wave(x/2) + wave(x/3/p)*wave(x/7)) / 2 - .25 }
function fillHue(l, r, h) { for (i = l; i < r; i++) hArr[i] = h }
var posterize = 0
function togglePosterize() { posterize = !posterize }
function flashPosterize() {
  beatDetected = togglePosterize
  gapParam = 1 + .4 * triangle(phrasePct) // This animates the posterized segments lengths
  FPLastSign = -1 // Init value. Will be 0 for gapGen(x) <= 0, 1 for positive gapGen(x)
  FPSegmentStart = 0
  FPHFn = (pct) => .3 + pct + time(5 / 65.536) // Hue function for gradient
  
  renderer = (i, x, y, z) => {
    pct = i / pixelCount

    if (posterize) {
      hsv(hArr[i], 1, (hArr[i] == hArr[max(0, i - 1)]))
    } else {
      hsv(FPHFn(pct), .75, .7)
    }

    // Calculate posterized segments for next frame
    var f = gapGen(5 + 10 * pct, gapParam) // Animate pct's coeffecient to vary segment frequency
    if (FPLastSign != f > 0) { // Detect a zero crossing in the gap function
      fillHue(FPSegmentStart, i, FPHFn((FPSegmentStart + i) / 2 / pixelCount))
      FPSegmentStart = i
    }
    FPLastSign = f > 0
  }
} 


function splotchOnBeatDetected(highs) {
  SOBColor = highs ? .5 : .97 + random(.06)
  SOBWidth = .05 + random(.2) // halfWidth in pct of strip
  SOBPos = SOBWidth + random(1 - 2 * SOBWidth)
  SOBLife = 1
}
function splotchOnBeat(delta) {
  beatDetected = splotchOnBeatDetected
  SOBLife *= .98
  renderer = (index, x, y, z) => {
    pct = index / pixelCount
    hsv(SOBColor, 1, near(pct, SOBPos, SOBWidth) * SOBLife * SOBLife)
    if (index % 3 == 0) {
      if (hhOn && pct > .8) hsv(.05, .8, 1)
      if (clapsOn && pct < .2) hsv(.05, 1, 1)
    }
  }
}


// A spectrum analyzer with some oscillating parameters
// Good demo: Sober by Childish Gambino, around 2:30
var fBins = 20, pixPerBin = pixelCount / fBins // bins must be <= 32 (# freq bins of SB)
var frequencyEMAs = array(fBins + 1)
var maxFreqEA = 0, scaledmaxFreqEMA
function analyzer(delta) {
  if (!SB()) next() // Pattern is trivial without SB
  fade = min(1, beatCount / 8); fade *= fade
  targetFill = volume / 2
  decay(.1)
  sensitivity = calcPIController(pic, targetFill - brightnessFeedback / pixelCount)
  brightnessFeedback = 0
  
  hSmoothingOsc = wave(2 * phrasePct + .5)     // Color splay oscillation
  vSmoothingOsc = wave(2 * phrasePct) // Oscillate beteen brightness smoothing on running average or statistical pick
  runAvg = 0  //volume // Base running average = base brightness.
  
  for (i = 0; i < fBins + 1; i++) {
    frequencyEMAs[i] = .2 * (frequencyData[i] * 10) + .8 * frequencyEMAs[i]
  }
  
  for (i = 0; i < pixelCount; i++) { // Calculate each pixel
    bin = floor(i / pixelCount * fBins) // Up to 32 bins
    vArr[i] = max(vArr[i], sensitivity * frequencyEMAs[bin])
    targetH = clamp(frequencyData[bin] * 7 / frequencyEMAs[bin], 1, 2.5) / 2
    if (targetH - hArr[i] > .2) hArr[i] = targetH // Jump to sudden peaks per bin
    hArr[i] += (targetH - hArr[i]) * .03          // Fade peak hue back slowly
  }

  if (currentPatternPct > .5) { // Peak Freq white
    maxFreqEA = .95 * maxFreqEA + .05 * log2(maxFrequency)
    scaledmaxFreqEMA = pow(2, maxFreqEA)
  
    for (i = 0; i < pixelCount; i++) {
      sArr[i] += (1 - sArr[i]) / 2
      nearness = near(scaledmaxFreqEMA / 1000, i / pixelCount, .05)
      if (nearness > 0) {
        sArr[i] = 1 - nearness
        vArr[i] = max(0, vArr[i] + nearness - .8)
      }
    }
  }
  
  renderer = (i, x, y, z) => {
    var near_i = clamp(i + (random(pixPerBin) - pixPerBin / 2), 0, pixelCount - 1)
    
    var v = vArr[i]
    brightnessFeedback += clamp(v, 0, 1)
    
    if (i < pixPerBin) { // Running average of bin neighbors
      runAvg += v
      v = runAvg / (i + 1)
    } else { 
      runAvg = runAvg + v - vArr[i - pixPerBin]
      v = runAvg / pixPerBin
    }

    v = vSmoothingOsc * v + (1 - vSmoothingOsc) * vArr[near_i]
    h = hSmoothingOsc * hArr[i] + (1 - hSmoothingOsc) * hArr[near_i]
    
    hsv(h, sArr[i], v * fade)
  }
}


// Elastic: Particles connected by rubber bands. Looks best with music that doesn't have beats every quarter note.
{
var particleCount = 5
var particlesX = array(particleCount)
var particlesV = array(particleCount)
var tensions = array(particleCount)
var unstretchedLen = pixelCount / 3 / particleCount
var elasticTarget = particlesX[0] = .5
}
// Move at least 1/8 of strip in either direction
var elasticOnBeat = () => elasticTarget = (elasticTarget/pixelCount + .125 + random(.75)) % 1 * pixelCount
function elastic(delta) {
  if (SB()) { // Sensor board: Move first ball on the beatDetected()
    beatDetected = elasticOnBeat
    if (beatIntervalTimer / 1000 > 4 * SPB) { // If 4 beats silence passed, wander around center
      elasticTarget += (.5 - elasticTarget / pixelCount) + .7 * wave(time(.2) - .5)
    }
  } else { triggerOn(beat, elasticOnBeat) }
  
  particlesX[0] += .2 * (elasticTarget - particlesX[0]) // Seek head to new location
  decay(.001 + pow(triangle(beatCount / 32), 6)) // Leave trails at 16 beats in, 48 in, etc
  colorSplay = volume  // How much to spread out colors
  var springK = .1 + .4 * currentPatternPct   // Spring constant. Higher is more energetic.
  var friction = .995 - springK/100   // Raise to .999 for lower spring constants / calmer songs
  delta /= 60          // Scale time

  for (var i = 0; i < particleCount - 1; i++) { // Calculate tensions for each pair
    var dir = particlesX[i+1] - particlesX[i] > 0 ? 1 : -1
    var dist = min(abs(particlesX[i+1] - particlesX[i]), pixelCount/2)
    var stretch = (dist < unstretchedLen) ? 0 : dir * (dist - unstretchedLen)
    tensions[i] = -springK * stretch // Force between i and i+1, in direction of action on particle i
  }
  for (var i = 1; i < particleCount; i++) { // Accellerate each particle
    particlesV[i] += (tensions[i-1] - tensions[i]) * delta // dv = netF * dt. tension[particleCount] is 0
    particlesV[i] *= friction
    particlesX[i] += particlesV[i] * delta
  }
  for (var i = 0; i < particleCount; i++) { // Plot each particle
    if (particlesX[i] > 0 && particlesX[i] < pixelCount ) {
      var pctNext = frac(particlesX[i])
      vArr[particlesX[i]] = 1 - pctNext 
      vArr[particlesX[i] + 1] = pctNext
      hArr[particlesX[i]] = hArr[particlesX[i] + 1] = .85 - (colorSplay * colorSplay) * i / particleCount
    }
  }
  
  renderer = (index, x, y, z) => { hsv(hArr[index], 1, vArr[index]) }
}


// Rays of different frequency bands traversing the strip
var ptrBase, bassArrPtr, midsArrPtr, highsArrPtr
var bassArr = array(pixelCount), midsArr = array(pixelCount), highsArr = array(pixelCount)
function soundRays(delta) {
  if (!SB()) next() // Pattern is trivial without SB
  
  if (!setupDone) {
    vArr.mutate(() => 0)
    bassArr.mutate(() => 0)
    midsArr.mutate(() => 0)
    highsArr.mutate(() => 0)
    setupDone = 1
  }
  
  ptrBase += delta / 60 // Different speeds for different frequencies
  highsArrPtr = mod(ptrBase * 7, pixelCount)
  midsArrPtr = mod(ptrBase * 3.5, pixelCount) 
  bassArrPtr = mod(ptrBase * 2, pixelCount)

  highsArr[mod(highsArrPtr - 1, pixelCount)] = clamp(hh / hhEMA - 1.5, 0, 1)
  midsArr[mod(midsArrPtr - 1, pixelCount)] = clamp(claps / clapsEMA - 1.5, 0, 1)
  bassArr[mod(bassArrPtr - 1, pixelCount)] = 
    // Different bass lines may require choosing between these and tuning them
    clamp(bassFastEMA / maxBass * 1.5 - .5, 0, 1)
    //clamp(bassFastEMA / bassSlowEMA * 1 - 1, 0, 1)
  
  
  renderer = (i) => { 
    bass_i = (i + bassArrPtr) % pixelCount
    mids_i = (i + midsArrPtr) % pixelCount
    highs_i = (i + highsArrPtr) % pixelCount
    
    if (1) { // 240 vs 96 FPS
      rgb(bassArr[bass_i] + .8 * midsArr[mids_i] + .19 * highsArr[highs_i] , 
          .2 * midsArr[mids_i],
          .9 * highsArr[highs_i])
    } else { // Use this if slower is OK but you need hue-wheel based manipulations
      mixHV(0, bassArr[bass_i], .11, midsArr[mids_i])
      mixHV(mixedH, mixedV, .86, highsArr[highs_i])
      hsv(mixedH, 1, mixedV * mixedV)
    }
  }
}


// PATTERNS FOR TUNING SOUND DETECTION

function renderInstrumentDetectors(index) {
  var pct = index / pixelCount
  if (index % 2 == 0) {
    if (bassOn && pct < .1) hsv(.005, 1, .1) // Red on beat present
    if (clapsOn && pct > .44 && pct < .55) hsv(.15, 1, .1) // Yellow claps
    if (hhOn && pct > .9) hsv(0, 0, .1) // White high hats
  } else {
    if (debounceTimers[beatTimerIdx] > 0 && pct < .1) hsv(.0, 1, 1)   // Bright red during beat detected threshold
    if (debounceTimers[clapsTimerIdx] > 0 && pct > .45 && pct < .55) hsv(.18, 1, 1) // Bright yellow during claps detected threshold
    if ( // hh > 1.5 * hhEMA  &&
        debounceTimers[hhTimerIdx] > 0
        && pct > .9) hsv(.0, 0, 1)     // Bright white during high hat detected threshold  
  }
}


function visualizeBassBands(delta) {
  if (!SB()) next() // Pattern is trivial without SB
  renderer = (index, x, y, z) => {
    var bands = 5
    var pct = index / pixelCount
    var bin = floor(0 + pct * bands)
    var pctOfBin = pct * bands % 1
    var v = (frequencyData[bin] / bassSlowEMA / 2) > pctOfBin
    hsv(1 - .01 * pctOfBin, 1, v)
    if (abs(pixelCount * (bass / bassSlowEMA / 3) - index) < 2) hsv(.33, 1, 1)
  }
}


function visualizeClapsBands(delta) {
  if (!SB()) next() // Pattern is trivial without SB
  renderer = (index, x, y, z) => {
    var bands = 6
    var pct = index / pixelCount
    var bin = floor(18 + pct * bands) // Starts on 18
    var pctOfBin = pct * bands % 1
    var v = ((frequencyData[bin] << 4) / (clapsEMA/6) / 6) > pctOfBin
    hsv(.5, 1, v * .3) // Cyan bins
    renderInstrumentDetectors(index)
  }
}


function visualizeHHBands(delta) {
  if (!SB()) next() // Pattern is trivial without SB
  renderer = (index, x, y, z) => {
    var bands = 8
    var pct = index / pixelCount
    var bin = floor(24 + pct * bands)
    var pctOfBin = pct * bands % 1
    var v = ((frequencyData[bin] << 4) / (hhEMA/6) / 6) > pctOfBin
    hsv(.36, .95, v * .3) // Mint bins
    // if (bin == 29 || bin == 30) hsv(1, 1, v * .3) // Red for the ones this pattern uses to detect HH
    renderInstrumentDetectors(index)
  }
}


function visualizeVolumes(delta) {
  if (!SB()) next() // Pattern is trivial without SB
  renderer = (index, x, y, z) => {
    pct = index / pixelCount
    if (abs(pixelCount * (bassSlowEMA / maxBass) - index) < 4) hsv(.5, 1, .4) // Blue slow bass
    if (abs(pixelCount * (bassFastEMA / maxBass) - index) < 2) hsv(.9, 1, 1)  // Purple fast bass
    // if (abs(pixelCount * (bassVelocitiesAvg - .3) / .4 - index) < 2) hsv(.1, 1, 1) // Orange, lFA .3 to .7
    if (abs(pixelCount * (3 + localVolRatio) / 6 - index) < 2) hsv(.36, .95, 1) // Green localVolRatio / 4
    if (abs(pixelCount * volume - index) < 1.5) hsv(0, 0, 1) // White volume
    renderInstrumentDetectors(index)
  }
}


{
var selectedPattern
export function sliderChooseManualPattern (_v) { 
  selectedPattern = _v
  beforeNext()
}
var patterns = array(20)
patterns[0] = piano
patterns[1] = elastic
patterns[2] = analyzer
patterns[3] = flashPosterize
patterns[4] = splotchOnBeat
patterns[5] = soundRays
patterns[6] = rain
patterns[7] = parallax
patterns[8] = hyper
patterns[9] = buildupSegments
patterns[10] = fizzleGrains
patterns[11] = flashSieves
patterns[12] = strobe
patterns[13] = dancingPixel
patterns[14] = halfSurge
patterns[15] = bassScope
patterns[16] = visualizeBassBands
patterns[17] = visualizeClapsBands
patterns[18] = visualizeHHBands
patterns[19] = visualizeVolumes
}
function manualPattern(delta) {
  patterns[selectedPattern * 19](delta)
}

// q(manualPattern, 16)  // This is very handy for debugging a particular pattern selected with the slider
// q(manualPattern, 999)
// q(manualPattern, 32)
// q(manualPattern, 256)









// ************************************************************************
// * PROGRAM SEQUENCE - A series of calls to enqueue()                    *
// ************************************************************************


setBPM(120)
setBeatsPerPhrase(16)        // Default is 32 beats per phrase
playUntilLoud(off, BPM * 3)  // Wait up to 3 minutes for sound
enqueue(piano, 20)           // Enqueue 20 beats of the "piano" pattern
 
expectBass(.3)               // This helps detect initial beats better when
                             // there's no history of bass levels

exec(() => themeHue = .6)    // Set theme hue global variable to light blue

playUntilBeat(prifika, BPM)  // Play "prifika" pattern for up to a minute, 
                             // waiting for for a beat
 
q(fizzleGrains, 8)           // On beat, switch to "fizzleGrains" for
                             // 8 beats. Notice BPMEst in watcher.

setBPMToDetected()           // Update the BPM to the detected BPM if 
                             // 8 consistent beats were found

q(soundRays, 8)              // `q()` is an alias for `enqueue()`
q(buildupSegments)
q(soundRays, 8)
q(visualizeClapsBands, 2)
q(visualizeHHBands, 2)
q(visualizeBassBands, 2)
q(visualizeVolumes, 2)
q(hyper, 24)
q(halfSurge)                // Without a duration, pattern plays for 1 phrase
q(fizzleGrains, 8)

exec(() => themeHue = .7)   // Set theme hue to darker blue / purple
q(prifika, 34)

// Music fades out
exec(() => themeHue = .006) // Set theme hue to red
playUntilBeat(off, BPM * 3) // Wait for downbeat

q(progress, 2)
for (i = 0; i < 2; i++) {
  exec(() => direction ^= 1)
  q(progress, 1)
}
for (i = 0; i < 2; i++) {
  exec(() => direction ^= 1)
  q(sweep, 1)
}
q(quarters, 2)
q(eiths, 4) 
for (i = 0; i < 8; i++) { 
  exec(() => direction ^= 1)
  exec(() => themeHue -= .002)
  enqueue(sweep, .5)
}

q(halfnoteBassHit, 2)
q(off, 2)
q(visualizeBassBands, 4)
q(halfnoteBassHit, 2)
q(off, 2)
q(visualizeBassBands, 2)
q(off, 1.5)
q(strobe, .5)

exec(() => themeHue = .33)    // Dancing pixel starts green
q(dancingPixel, 15.5)
playUntilBeat(off, 1)         // Realign with beat

q(bassScope)
q(elastic)
q(splotchOnBeat)

q(rain, 24)
q(flashPosterize, 24)
q(elastic, 16)
q(parallax, 32)
q(flashSieves, 16)

q(analyzer, 64)

begin()                       // Every sequence must end with `begin()` :)
