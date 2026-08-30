import Cocoa

func savePNG(_ image: NSImage, to path: String) {
  guard let tiff = image.tiffRepresentation,
        let bitmap = NSBitmapImageRep(data: tiff),
        let data = bitmap.representation(using: .png, properties: [:]) else { fatalError("PNG encoding failed") }
  try! data.write(to: URL(fileURLWithPath: path))
}

func appIcon(size: CGFloat) -> NSImage {
  let image = NSImage(size: NSSize(width: size, height: size))
  image.lockFocus()
  NSColor.clear.setFill(); NSRect(x: 0, y: 0, width: size, height: size).fill()
  let inset = size * 0.06
  let tile = NSBezierPath(roundedRect: NSRect(x: inset, y: inset, width: size - inset * 2, height: size - inset * 2), xRadius: size * 0.22, yRadius: size * 0.22)
  NSColor(calibratedWhite: 0.035, alpha: 1).setFill(); tile.fill()
  let l = NSBezierPath()
  l.move(to: NSPoint(x: size * 0.37, y: size * 0.70))
  l.line(to: NSPoint(x: size * 0.37, y: size * 0.40))
  l.curve(to: NSPoint(x: size * 0.49, y: size * 0.30), controlPoint1: NSPoint(x: size * 0.37, y: size * 0.33), controlPoint2: NSPoint(x: size * 0.41, y: size * 0.30))
  l.line(to: NSPoint(x: size * 0.68, y: size * 0.30))
  l.lineWidth = size * 0.12
  l.lineCapStyle = .round
  l.lineJoinStyle = .round
  NSColor.white.setStroke(); l.stroke()
  image.unlockFocus()
  return image
}

func trayIcon(width: CGFloat, height: CGFloat) -> NSImage {
  let image = NSImage(size: NSSize(width: width, height: height))
  image.lockFocus()
  NSColor.clear.setFill(); NSRect(x: 0, y: 0, width: width, height: height).fill()
  let l = NSBezierPath()
  l.move(to: NSPoint(x: width * 0.34, y: height * 0.78))
  l.line(to: NSPoint(x: width * 0.34, y: height * 0.34))
  l.curve(to: NSPoint(x: width * 0.48, y: height * 0.22), controlPoint1: NSPoint(x: width * 0.34, y: height * 0.26), controlPoint2: NSPoint(x: width * 0.39, y: height * 0.22))
  l.line(to: NSPoint(x: width * 0.72, y: height * 0.22))
  l.lineWidth = max(2, width * 0.18)
  l.lineCapStyle = .round
  l.lineJoinStyle = .round
  NSColor.black.setStroke(); l.stroke()
  image.unlockFocus()
  return image
}

let root = CommandLine.arguments[1]
let assets = root + "/Assets"
let renderer = root + "/renderer"
savePNG(appIcon(size: 1024), to: assets + "/LingoIsland-1024.png")
savePNG(appIcon(size: 512), to: renderer + "/logo-l.png")
savePNG(trayIcon(width: 16, height: 18), to: root + "/trayLTemplate.png")
savePNG(trayIcon(width: 32, height: 36), to: root + "/trayLTemplate@2x.png")
