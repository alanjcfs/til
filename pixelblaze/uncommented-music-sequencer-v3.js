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
  renderer(index, x, y, z);
}
function processSound(delta) {
  processVolume(delta)
  processInstruments(delta)
  inferTempo(delta)
}
var EAThreshold = .02, maxEA = EAThreshold * 1.1, smoothedEA = EAThreshold, maxEATimer
export var localVolRatio = .5
export var volume = .25
function processVolume(delta) {
  var scaledEA = energyAverage << 4
  smoothedEA = .05 * scaledEA + .95 * smoothedEA
  if (scaledEA >= maxEA) { maxEA = scaledEA; maxEATimer = 0 }
  maxEATimer += delta / 10
  if (scaledEA > EAThreshold && maxEATimer >= 8000) maxEA *= .99
  maxEATimer = min(8000, maxEATimer)
  localVolRatio = scaledEA > EAThreshold && scaledEA / smoothedEA
  volume = scaledEA > EAThreshold && smoothedEA / maxEA
  if (continueMode == 2 && volume > .8) next(40)
}
{
var minBeatRetrigger = .2
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
var hh, hhEMA = .1, hhOn
var claps, clapsEMA = .1, clapsOn
var bass, maxBass, bassOn
var bassSlowEMA = .001, bassFastEMA = .001
var bassThreshold = .02
var maxBass = bassThreshold
function beatDetected() {}
function clapsDetected() {}
function hhDetected() {}
var hhThreshold = 2
function processInstruments(delta) {
  hh = (frequencyData[29] + frequencyData[30]) << 4
  hhOn = hh > hhThreshold * hhEMA
  debounce(hhOn, hhDetected, hhTimerIdx, beatsToMs(minBeatRetrigger), delta)
  hhEMA = .02 * hh + .98 * hhEMA
  claps = 0; for (i = 18; i <= 24; i++) claps += frequencyData[i] << 4
  clapsOn = claps > 3 * clapsEMA
  debounce(clapsOn, clapsDetected, clapsTimerIdx, beatsToMs(minBeatRetrigger), delta)
  clapsEMA = .02 * claps + .98 * clapsEMA
  bass = frequencyData[1] + frequencyData[2] + frequencyData[3]
  maxBass = max(maxBass, bass)
  if (maxBass > 10 * bassSlowEMA && maxBass > bassThreshold) maxBass *= .99
  bassSlowEMA = (bassSlowEMA * 999 + bass) / 1000
  bassFastEMA = (bassFastEMA * 9 + bass) / 10
}
var bassVelocitiesSize = 5
var bassVelocities = array(bassVelocitiesSize)
var lastBassFastEMA = .5, bassVelocitiesAvg = .5
var bassVelocitiesPointer = 0
var beatIntervalSamples = 8, beatIntervalPtr = 0, beatIntervalTimer = 0
var beatIntervals = array(beatIntervalSamples)
function inferTempo(delta) {
  bassVelocities[bassVelocitiesPointer] = (bassFastEMA - lastBassFastEMA) / maxBass
  bassVelocitiesAvg += bassVelocities[bassVelocitiesPointer] / bassVelocitiesSize
  bassVelocitiesPointer = (bassVelocitiesPointer + 1) % bassVelocitiesSize
  bassVelocitiesAvg -= bassVelocities[bassVelocitiesPointer] / bassVelocitiesSize
  bassOn = bassVelocitiesAvg > .51
  debounce(bassOn, beatDetectedWrapper, beatTimerIdx, beatsToMs(minBeatRetrigger), delta)
  beatIntervalTimer += delta
  if (beatIntervalTimer > 5000) beatIntervalTimer = 5000
  lastBassFastEMA = bassFastEMA
}
function beatDetectedWrapper() {
  if (beatIntervalTimer >= 5000) {
    beatIntervals.mutate(() => 0)
    beatIntervalTimer = beatIntervalPtr = 0
  }
  beatIntervals[beatIntervalPtr] = beatIntervalTimer
  beatIntervalTimer = 0
  beatIntervalPtr = (beatIntervalPtr + 1) % beatIntervalSamples
  if (beatIntervals[0] != 0) estimateBPM()
  if (continueMode == 1) next(120)
  beatDetected()
}
export var BPMEst = 0, BPMEstReliable = 0
var meanBeatInterval = 0
function estimateBPM() {
  meanBeatInterval = beatIntervals.sum() / beatIntervalSamples
  var errSum = beatIntervals.reduce((a, v) => {
    var diff = (v - meanBeatInterval) / 100
    return a + diff * diff
  }, 0)
  var stdDev = sqrt(errSum / beatIntervalSamples) / (meanBeatInterval / 100)
  if (stdDev < .1) {
    BPMEst = 6000 / (meanBeatInterval / 10)
    BPMEst = round(BPMEst)
    BPMEstReliable = 1
  } else {
    BPMEstReliable = 0
  }
}
export var BPM = 120
var SPB
var beatsPerMeasure = 4
var beatsPerPhrase = 32
var currentPatternMs = 0
var currentPatternS = 0
var currentPatternDuration = 0
var currentPatternBeats = 0
var currentPatternPct = 0
var beatCount
var phrasePct
var measure, wholenote, halfnote, beat, note_8, note_16
var currentBeforeRenderer
var totalPatternCount = 0
var currentPatternIdx = 0
var beforeRendererQueue = array(256)
var durationQueue = array(256)
var continueModeQueue = array(256)
var continueMode
function enqueue(BRFn, _beats, continueMode) {
  beforeRendererQueue[totalPatternCount] = BRFn
  durationQueue[totalPatternCount] = _beats
  continueModeQueue[totalPatternCount] = continueMode
  totalPatternCount++
}
q = enqueue
function playUntilBeat(BRFn, _beats) {
  enqueue(BRFn, _beats, 1)
}
function playUntilLoud(BRFn, _beats) {
  enqueue(BRFn, _beats, 2)
}
function exec(fn, argument) {
  if (argument == 0) {
    enqueue(fn, null, 9)
  } else {
    enqueue(fn, argument, 9)
  }
}
function setBPM(_bpm) {
  enqueue((__bpm) => BPM = __bpm, _bpm, 9)
}
function setBPMToDetected() {
  enqueue((_) => BPM = BPMEst || BPM, null, 9)
}
function setBeatsPerPhrase(_bpp) {
  enqueue((__bpp) => beatsPerPhrase = __bpp, _bpp, 9)
}
function expectBass(bassLvl) {
  exec((_bassLvl) => { maxBass = _bassLvl; bassSlowEMA = maxBass / 2 }, bassLvl)
}
var ONE_MINUS_EPSILON = (0xFF >> 16) + (0xFF >> 8)
function updateTimers(delta) {
  currentPatternMs += delta
  if (currentPatternMs > 32000) { currentPatternMs -= 32000 }
  currentPatternS += delta / 1000
  if (currentPatternS >= currentPatternDuration) next()
  currentPatternPct = currentPatternS / currentPatternDuration
  SPB = 60 / BPM
  beatCount = currentPatternS / SPB
  phrasePct = currentPatternS / (beatsPerPhrase * SPB) % 1
  measure = ONE_MINUS_EPSILON - currentPatternS / (beatsPerMeasure * SPB) % 1
  wholenote = ONE_MINUS_EPSILON - currentPatternS / (4 * SPB) % 1
  halfnote = 2 * wholenote % 1
  beat = 4 * wholenote % 1
  note_8 = 8 * wholenote % 1
  note_16 = 16 * wholenote % 1
}
function beforeNext() {
  for (i = 0; i < pixelCount + 1; i++) {
    hArr[i] = 0; sArr[i] = 1; vArr[i] = 0
  }
  setupDone = 0
  lastTrigger = -1
  beatDetected = clapsDetected = hhDetected = () => {}
}
function next(startAtMs) {
  beforeNext()
  currentPatternMs = startAtMs
  currentPatternS = currentPatternMs / 1000
  currentPatternIdx++
  if (currentPatternIdx >= totalPatternCount) {
    loop()
    return
  }
  currentPatternBeats = durationQueue[currentPatternIdx]
  continueMode = continueModeQueue[currentPatternIdx]
  if (continueMode <= 2) {
    currentBeforeRenderer = beforeRendererQueue[currentPatternIdx]
    currentPatternBeats = currentPatternBeats || beatsPerPhrase
    currentPatternDuration = currentPatternBeats * 60 / BPM
  } else if (continueMode == 9) {
    beforeRendererQueue[currentPatternIdx](currentPatternBeats)
    next()
  } else if (continueMode()) { next() }
}
function halt() { beforeRender = (d) => { renderer = (i,x,y,z) => { hsv(0,0,0) } } }
function loop() { begin() }
function repeatLast () { currentPatternIdx-- }
function begin() {
  currentPatternIdx = -1
  next()
}
var setupDone = 0
var hArr = array(pixelCount + 1)
var sArr = array(pixelCount + 1)
var vArr = array(pixelCount + 1)
var themeHue
var direction
var targetFill = 0.2
var brightnessFeedback = 0
var sensitivity = 0
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
function fixH(pH) {
  return wave((mod(pH, 1) - .5) / 2)
}
function near(a, b, halfwidth) {
  if (halfwidth == 0) halfwidth = .125
  var v = clamp(1 - abs(a - b) / halfwidth, 0, 1)
  return v * v
}
var noteNum
function detectNote() {
  return round(12 * log2(maxFrequency / 220))
}
function decay(seconds, delta) {
  delta = delta || 3
  var decayCoeff = pow(2, log2(.99) * delta / seconds / 2)
  for (i = 0; i < vArr.length; i++) vArr[i] *= decayCoeff
}
var lastTrigger = -1
function triggerOn(t, fn, onFalling) {
  if (lastTrigger == -1) lastTrigger = onFalling
  if (lastTrigger != t && (onFalling ^ t > lastTrigger)) fn()
  lastTrigger = t
}
var mixedH, mixedV
function mixHV(h1, v1, h2, v2) {
  v1 = clamp(v1, 0, 1); v2 = clamp(v2, 0, 1)
  var cosHues = v2 * cos((h2 - h1) * PI2)
  mixedV = sqrt(v1 * v1 + v2 * v2 + 2 * v1 * cosHues)
  mixedH = h1 + atan2(v2 * sin((h2 - h1) * PI2), v1 + cosHues) / PI2
}
function off(delta) { renderer = (i, x, y, z) => hsv(0, 0, 0) }
function progress(delta) {
  renderer = (i, x, y, z) => {
    var pct = direction > 0 ? i / pixelCount : 1 - i / pixelCount
    hsv(themeHue, 1, beat * (currentPatternPct > pct))
  }
}
function measureProgress(delta) {
  renderer = (i, x, y, z) => {
    var pct = direction > 0 ? i / pixelCount : 1 - i / pixelCount
    hsv(themeHue, 1, beat * (measure > pct))
  }
}
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
function halfnoteBassHit(delta) {
  var bassDFreq = .6 * wave((5 + 5 * halfnote) * halfnote) - .3
  pos = .5 + bassDFreq * pow(halfnote, 3)
  baseH = .15 * (1 - currentPatternPct)
  renderer = (i, x, y, z) => {
    v = near(pos, i / pixelCount)
    hsv(fixH(baseH - v / 8), 1, v * v)
  }
}
function bassScope() {
  var bassDFreq = .6 * wave((10 + 20 * beat) * beat) - .3
  pos = .5 + bassDFreq * pow(beat, 3)
  width = triangle(currentPatternPct)
  width = .05 + width * width * width
  baseH = 1 - currentPatternPct * floor(measure * beatsPerMeasure) / beatsPerMeasure
  renderer = (i, x, y, z) => {
    v = near(pos, i / pixelCount, width)
    hsv(fixH(baseH - v / 6), 1, v * v)
  }
}
var paintPtr, paintStart, paintLen, paintArrPtr, paintHue
function paintFizzle(newFizzle) {
  var paintMinLen = pixelCount/10
  if (newFizzle) {
    paintHue = time(10 / 65.536) + (random(1) > .5 ? 0 : .15)
    paintPtr = paintArrPtr = paintStart = mod(paintStart + 2 * paintMinLen + random(pixelCount - 3 * paintMinLen), pixelCount)
    paintLen = (paintMinLen + random(pixelCount - paintMinLen)) * (random(1) > .125 ? paintLen/paintLen : -paintLen/paintLen)
    vArr[paintStart] = random(1); hArr[paintStart] = fixH(paintHue)
  }
  for (i = 0; i <= newFizzle * paintMinLen; i++) {
    paintLen > 0 ? paintPtr++ : paintPtr--
    prevPtr = paintArrPtr
    var paintArrPtr = mod(paintPtr, pixelCount)
    vArr[paintArrPtr] = .1 + random(.2)
    if (vArr[prevPtr] > .5 ^ .8 > random(1)) vArr[paintArrPtr] += .3 + random(.5)
    hArr[paintArrPtr] = fixH(paintHue)
  }
}
var newPainter = () => paintFizzle(1)
function fizzleGrains(d) {
  decay(clamp(1 / (volume + .1), .1, 10), d)
  beatDetected = newPainter
  if (claps > 1.5 * clapsEMA) paintFizzle()
  renderer = (i, x, y, z) => {
    var shimmer = .7 + .3 * wave(i / 6 + time(0.1 / 65.536))
    hsv(hArr[i], vArr[i] < .8, vArr[i] * vArr[i] * shimmer)
  }
}
var segmentsOn, segmentCount, beatsRemaining, flash = 0
function buildupSegments() {
  beatsRemaining = currentPatternBeats - beatCount
  segmentCount = pow(2, 5 - ceil(max(0, log2((beatsRemaining - 4))))) + 2
  if (beatsRemaining < 4) { flash = note_16 > .8 || note_16 < .1 }
  else if (beatsRemaining < 8) { flash = note_8 > .8 || note_8 < .1 }
  else { flash = beat > .8 }
  triggerOn(flash, () => {
    segmentsOn = random(32768)
    if (segmentCount <= 6) {
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
    hsv(h, beatsRemaining >= 2, v * spacer)
  }
}
function hyper(delta) {
  renderer = (index, x, y, z) => {
    var sat = 1
    var pct = index / pixelCount
    if (beatCount > 18) pct = 1 - pct
    var sweepIn = pct - clamp((4 - beatCount) / 4, 0, 1) + max(0, 1 - abs(beatCount - 16) / 2)
    var pulse = 8 * sweepIn * sweepIn * (.5 + sweepIn) + beat * (sweepIn > 0)
    if (pulse > 1) {
      pulse = pulse % 1 * (1 - pct * pct * (note_16 * (localVolRatio - .8) % 1 > .25))
    } else {
      sat = note_16 > .5
    }
    hsv(floor(beatCount / 8) * .166 -.166 * (beatCount > 18), sat, pulse)
  }
}
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
  var t1 = phrasePct
  if (currentPatternPct > .5) t1 += wave(8 * phrasePct) / 8 * 2 * (currentPatternPct - .5)
  decay(.2, delta)
  for (i = 0; i < plxParticleCount; i++) {
    var particleX = plxObjectMaxH * ((t1 + plxParticleOffsets[i]) % 1)
    var distance = plxObjecMaxD - plxWindowDepth * i / plxParticleCount
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
{
var dropCount = 4
var dropsX = array(dropCount)
var dropsNearness = array(dropCount)
var dropsGroundX = array(dropCount)
var dropSplashes = array(pixelCount)
var splashH = (t, p) => max(0, 4 * t * (sqrt(p) / p - t))
}
function newDrop(close) {
  for (i = 0; i < dropCount; i++) {
    if (dropsX[i] == 0) {
      dropsX[i] = 1
      dropsNearness[i] = 1 - random(1) / (1 + close * 3)
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
  if (SB()) {
    beatDetected = newDropClose
    clapsDetected = newDrop
    if (beatIntervalTimer / 1000 > 8 * SPB) {
      if (random(800) < delta) newDrop()
    }
  } else { if (random(400) < delta) newDrop() }
  for (i = 0; i < dropCount; i++) {
    if (dropsX[i] > 0) {
      if (dropsX[i] >= 1.3 * pixelCount) { dropsX[i] = 0; continue }
      var pastGround = dropsX[i] - dropsGroundX[i]
      if (pastGround > 0) {
        splashAnimPct = pastGround / (pixelCount / 4)
        dropsX[i] += delta / 24
        if (splashAnimPct >= .9) { dropsX[i] = 0; continue }
        for (n = 0; n <= 3; n++) {
          splashPixel = clamp(dropsGroundX[i] - dropsNearness[i] * 20 * splashH(splashAnimPct, sqrt(pow(2, n))), 0, pixelCount - 1)
          dropSplashes[splashPixel] = dropsNearness[i] * dropsNearness[i] * (1 - splashAnimPct)
        }
      } else {
        dropsX[i] += delta * (.1 + .4 * dropsNearness[i])
      }
    }
  }
  renderer = (index, x, y, z) => {
    index = pixelCount - 1 - index
    if (index < pixelCount / 2) {
      var skyV = .05 + .1 * index / pixelCount
      hsv(.05, 0.7, skyV * skyV)
    }
    var maxV = 0
    for (i = 0; i < dropCount; i++) {
      if ( index < dropsX[i]
        && index > (dropsX[i] - 20 * dropsNearness[i])
        && index < dropsGroundX[i] )
          maxV = max(maxV, .2 + .8 * dropsNearness[i])
    }
    if (maxV > 0) hsv(0, 0, maxV * maxV)
    if (dropSplashes[index]) {
      hsv(.55, .8, dropSplashes[index])
      dropSplashes[index] = 0
    }
  }
}
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
var fade, pixPerNote
function piano(delta) {
  if (!SB()) next()
  fade = min(beatCount / 4, min(1, (currentPatternBeats - beatCount) / 4))
  fade *= fade
  var pianoNotes = 3 * 12; pixPerNote = pixelCount / pianoNotes
  noteNum = mod(detectNote() - 12, pianoNotes)
  if (maxFrequencyMagnitude < .05) noteNum = -1
  decay(.2, delta)
  renderer = (i, x, y, z) => {
    var note = i / pixPerNote
    var isNatural =  (0b010110101101 >> (floor(note) % 12)) & 1
    hsv(.06, .7, isNatural * (.02 + .1 * (clapsOn || hhOn)) * fade)
    if (!floor(i % pixPerNote)) hsv(.05, .7, (.2 + bassFastEMA / maxBass) * fade)
    if (note > noteNum && note < noteNum + 1) {
      hArr[i] = fixH(noteNum / 12)
      vArr[i] = .1  + 3 * maxFrequencyMagnitude
    }
    if (vArr[i] > .02) hsv(hArr[i], 1, vArr[i] * fade)
  }
}
var ptrBase, t1, t2, fade, hueDrift
function prifika(delta) {
  fade = min(beatCount / 4, 1); fade *= fade
  hueDrift = max(0, (beatCount - 16) / 64)
  ptrBase += delta >> 12
  t1 = time(.1)
  t2 = triangle(pow((currentPatternS + 7.7) / 15.0733 % 1, 7))
  renderer = (i, x, y, z) => {
    var pct = i / pixelCount
    var s = wave(10 * (pct/8 - t2)) * square(pct/8 - t2 + .125, .1)
    s *= s*s
    pct = 2 * (pct - .5)
    var w1 = .5 * wave(2 * pct + t1 + ptrBase) - .03
    var w2 = .5 * wave(2.3 * pct - t1) - .03
    var w3 = wave(1.7 * pct - t1 - .25)
    var w4 = wave((1 + 3 * wave((t1 / 2 - 1)* t1)) * pct + 2 * t1 - .25)
    var w5 =  wave(1.1 * pct - t1 - .25 - ptrBase/2.3) / 2 - .25
    var v = w1 + w2 + w4/2 + s + w5
    hsv(themeHue + hueDrift + .1 * w3 - .1 * w4, sqrt(1-s), v * v * v * fade * volume)
  }
}
function gapGen(x, p) { return (wave(x/5/p)*wave(x/2) + wave(x/3/p)*wave(x/7)) / 2 - .25 }
function fillHue(l, r, h) { for (i = l; i < r; i++) hArr[i] = h }
var posterize = 0
function togglePosterize() { posterize = !posterize }
function flashPosterize() {
  beatDetected = togglePosterize
  gapParam = 1 + .4 * triangle(phrasePct)
  FPLastSign = -1
  FPSegmentStart = 0
  FPHFn = (pct) => .3 + pct + time(5 / 65.536)
  renderer = (i, x, y, z) => {
    pct = i / pixelCount
    if (posterize) {
      hsv(hArr[i], 1, (hArr[i] == hArr[max(0, i - 1)]))
    } else {
      hsv(FPHFn(pct), .75, .7)
    }
    var f = gapGen(5 + 10 * pct, gapParam)
    if (FPLastSign != f > 0) {
      fillHue(FPSegmentStart, i, FPHFn((FPSegmentStart + i) / 2 / pixelCount))
      FPSegmentStart = i
    }
    FPLastSign = f > 0
  }
}
function splotchOnBeatDetected(highs) {
  SOBColor = highs ? .5 : .97 + random(.06)
  SOBWidth = .05 + random(.2)
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
var fBins = 20, pixPerBin = pixelCount / fBins
var frequencyEMAs = array(fBins + 1)
var maxFreqEA = 0, scaledmaxFreqEMA
function analyzer(delta) {
  if (!SB()) next()
  fade = min(1, beatCount / 8); fade *= fade
  targetFill = volume / 2
  decay(.1)
  sensitivity = calcPIController(pic, targetFill - brightnessFeedback / pixelCount)
  brightnessFeedback = 0
  hSmoothingOsc = wave(2 * phrasePct + .5)
  vSmoothingOsc = wave(2 * phrasePct)
  runAvg = 0
  for (i = 0; i < fBins + 1; i++) {
    frequencyEMAs[i] = .2 * (frequencyData[i] * 10) + .8 * frequencyEMAs[i]
  }
  for (i = 0; i < pixelCount; i++) {
    bin = floor(i / pixelCount * fBins)
    vArr[i] = max(vArr[i], sensitivity * frequencyEMAs[bin])
    targetH = clamp(frequencyData[bin] * 7 / frequencyEMAs[bin], 1, 2.5) / 2
    if (targetH - hArr[i] > .2) hArr[i] = targetH
    hArr[i] += (targetH - hArr[i]) * .03
  }
  if (currentPatternPct > .5) {
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
    if (i < pixPerBin) {
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
{
var particleCount = 5
var particlesX = array(particleCount)
var particlesV = array(particleCount)
var tensions = array(particleCount)
var unstretchedLen = pixelCount / 3 / particleCount
var elasticTarget = particlesX[0] = .5
}
var elasticOnBeat = () => elasticTarget = (elasticTarget/pixelCount + .125 + random(.75)) % 1 * pixelCount
function elastic(delta) {
  if (SB()) {
    beatDetected = elasticOnBeat
    if (beatIntervalTimer / 1000 > 4 * SPB) {
      elasticTarget += (.5 - elasticTarget / pixelCount) + .7 * wave(time(.2) - .5)
    }
  } else { triggerOn(beat, elasticOnBeat) }
  particlesX[0] += .2 * (elasticTarget - particlesX[0])
  decay(.001 + pow(triangle(beatCount / 32), 6))
  colorSplay = volume
  var springK = .1 + .4 * currentPatternPct
  var friction = .995 - springK/100
  delta /= 60
  for (var i = 0; i < particleCount - 1; i++) {
    var dir = particlesX[i+1] - particlesX[i] > 0 ? 1 : -1
    var dist = min(abs(particlesX[i+1] - particlesX[i]), pixelCount/2)
    var stretch = (dist < unstretchedLen) ? 0 : dir * (dist - unstretchedLen)
    tensions[i] = -springK * stretch
  }
  for (var i = 1; i < particleCount; i++) {
    particlesV[i] += (tensions[i-1] - tensions[i]) * delta
    particlesV[i] *= friction
    particlesX[i] += particlesV[i] * delta
  }
  for (var i = 0; i < particleCount; i++) {
    if (particlesX[i] > 0 && particlesX[i] < pixelCount ) {
      var pctNext = frac(particlesX[i])
      vArr[particlesX[i]] = 1 - pctNext
      vArr[particlesX[i] + 1] = pctNext
      hArr[particlesX[i]] = hArr[particlesX[i] + 1] = .85 - (colorSplay * colorSplay) * i / particleCount
    }
  }
  renderer = (index, x, y, z) => { hsv(hArr[index], 1, vArr[index]) }
}
var ptrBase, bassArrPtr, midsArrPtr, highsArrPtr
var bassArr = array(pixelCount), midsArr = array(pixelCount), highsArr = array(pixelCount)
function soundRays(delta) {
  if (!SB()) next()
  if (!setupDone) {
    vArr.mutate(() => 0)
    bassArr.mutate(() => 0)
    midsArr.mutate(() => 0)
    highsArr.mutate(() => 0)
    setupDone = 1
  }
  ptrBase += delta / 60
  highsArrPtr = mod(ptrBase * 7, pixelCount)
  midsArrPtr = mod(ptrBase * 3.5, pixelCount)
  bassArrPtr = mod(ptrBase * 2, pixelCount)
  highsArr[mod(highsArrPtr - 1, pixelCount)] = clamp(hh / hhEMA - 1.5, 0, 1)
  midsArr[mod(midsArrPtr - 1, pixelCount)] = clamp(claps / clapsEMA - 1.5, 0, 1)
  bassArr[mod(bassArrPtr - 1, pixelCount)] =
    clamp(bassFastEMA / maxBass * 1.5 - .5, 0, 1)
  renderer = (i) => {
    bass_i = (i + bassArrPtr) % pixelCount
    mids_i = (i + midsArrPtr) % pixelCount
    highs_i = (i + highsArrPtr) % pixelCount
    if (1) {
      rgb(bassArr[bass_i] + .8 * midsArr[mids_i] + .19 * highsArr[highs_i] ,
          .2 * midsArr[mids_i],
          .9 * highsArr[highs_i])
    } else {
      mixHV(0, bassArr[bass_i], .11, midsArr[mids_i])
      mixHV(mixedH, mixedV, .86, highsArr[highs_i])
      hsv(mixedH, 1, mixedV * mixedV)
    }
  }
}
function renderInstrumentDetectors(index) {
  var pct = index / pixelCount
  if (index % 2 == 0) {
    if (bassOn && pct < .1) hsv(.005, 1, .1)
    if (clapsOn && pct > .44 && pct < .55) hsv(.15, 1, .1)
    if (hhOn && pct > .9) hsv(0, 0, .1)
  } else {
    if (debounceTimers[beatTimerIdx] > 0 && pct < .1) hsv(.0, 1, 1)
    if (debounceTimers[clapsTimerIdx] > 0 && pct > .45 && pct < .55) hsv(.18, 1, 1)
    if (
        debounceTimers[hhTimerIdx] > 0
        && pct > .9) hsv(.0, 0, 1)
  }
}
function visualizeBassBands(delta) {
  if (!SB()) next()
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
  if (!SB()) next()
  renderer = (index, x, y, z) => {
    var bands = 6
    var pct = index / pixelCount
    var bin = floor(18 + pct * bands)
    var pctOfBin = pct * bands % 1
    var v = ((frequencyData[bin] << 4) / (clapsEMA/6) / 6) > pctOfBin
    hsv(.5, 1, v * .3)
    renderInstrumentDetectors(index)
  }
}
function visualizeHHBands(delta) {
  if (!SB()) next()
  renderer = (index, x, y, z) => {
    var bands = 8
    var pct = index / pixelCount
    var bin = floor(24 + pct * bands)
    var pctOfBin = pct * bands % 1
    var v = ((frequencyData[bin] << 4) / (hhEMA/6) / 6) > pctOfBin
    hsv(.36, .95, v * .3)
    renderInstrumentDetectors(index)
  }
}
function visualizeVolumes(delta) {
  if (!SB()) next()
  renderer = (index, x, y, z) => {
    pct = index / pixelCount
    if (abs(pixelCount * (bassSlowEMA / maxBass) - index) < 4) hsv(.5, 1, .4)
    if (abs(pixelCount * (bassFastEMA / maxBass) - index) < 2) hsv(.9, 1, 1)
    if (abs(pixelCount * (3 + localVolRatio) / 6 - index) < 2) hsv(.36, .95, 1)
    if (abs(pixelCount * volume - index) < 1.5) hsv(0, 0, 1)
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
setBPM(120)
setBeatsPerPhrase(16)
playUntilLoud(off, BPM * 3)
enqueue(piano, 20)
expectBass(.3)
exec(() => themeHue = .6)
playUntilBeat(prifika, BPM)
q(fizzleGrains, 8)
setBPMToDetected()
q(soundRays, 8)
q(buildupSegments)
q(soundRays, 8)
q(visualizeClapsBands, 2)
q(visualizeHHBands, 2)
q(visualizeBassBands, 2)
q(visualizeVolumes, 2)
q(hyper, 24)
q(halfSurge)
q(fizzleGrains, 8)
exec(() => themeHue = .7)
q(prifika, 34)
exec(() => themeHue = .006)
playUntilBeat(off, BPM * 3)
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
exec(() => themeHue = .33)
q(dancingPixel, 15.5)
playUntilBeat(off, 1)
q(bassScope)
q(elastic)
q(splotchOnBeat)
q(rain, 24)
q(flashPosterize, 24)
q(elastic, 16)
q(parallax, 32)
q(flashSieves, 16)
q(analyzer, 64)
begin()
