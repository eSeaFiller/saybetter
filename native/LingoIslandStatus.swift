import Cocoa
import Foundation

final class AppDelegate: NSObject, NSApplicationDelegate {
  private var statusItem: NSStatusItem!
  private var clipboardItem: NSMenuItem!
  private var clipboardPaused = false

  func applicationDidFinishLaunching(_ notification: Notification) {
    clipboardPaused = CommandLine.arguments.dropFirst().first == "paused"
    statusItem = NSStatusBar.system.statusItem(withLength: 24)
    if let button = statusItem.button {
      button.title = "L"
      button.font = NSFont.monospacedSystemFont(ofSize: 14, weight: .semibold)
      button.toolTip = "Saybetter-A lingoisland"
    }
    let menu = NSMenu()
    add(menu, "打开 Saybetter-A lingoisland", "show:translate")
    add(menu, "Introduction", "show:intro")
    menu.addItem(.separator())
    add(menu, "API 与模型…", "show:settings")
    clipboardItem = NSMenuItem(title: clipboardPaused ? "恢复读取复制内容" : "暂停读取复制内容", action: #selector(toggleClipboard(_:)), keyEquivalent: "")
    clipboardItem.target = self
    menu.addItem(clipboardItem)
    add(menu, "收藏与导出", "show:favorites")
    add(menu, "导出收藏…", "export:favorites")
    menu.addItem(.separator())
    let language = NSMenuItem(title: "目标语言", action: nil, keyEquivalent: "")
    let languageMenu = NSMenu()
    add(languageMenu, "英语", "language:en")
    add(languageMenu, "法语", "language:fr")
    add(languageMenu, "德语", "language:de")
    add(languageMenu, "日语", "language:ja")
    language.submenu = languageMenu
    menu.addItem(language)
    let appearance = NSMenuItem(title: "外观", action: nil, keyEquivalent: "")
    let appearanceMenu = NSMenu()
    add(appearanceMenu, "跟随系统", "appearance:system")
    add(appearanceMenu, "浅色", "appearance:light")
    add(appearanceMenu, "深色", "appearance:dark")
    appearance.submenu = appearanceMenu
    menu.addItem(appearance)
    menu.addItem(.separator())
    add(menu, "关于 Saybetter-A lingoisland", "show:about")
    add(menu, "问题反馈…", "feedback")
    menu.addItem(.separator())
    add(menu, "退出 Saybetter-A lingoisland", "quit")
    statusItem.menu = menu
  }

  private func add(_ menu: NSMenu, _ title: String, _ command: String) {
    let item = NSMenuItem(title: title, action: #selector(runCommand(_:)), keyEquivalent: "")
    item.target = self
    item.representedObject = command
    menu.addItem(item)
  }

  @objc private func toggleClipboard(_ sender: NSMenuItem) {
    clipboardPaused.toggle()
    sender.title = clipboardPaused ? "恢复读取复制内容" : "暂停读取复制内容"
    send(clipboardPaused ? "clipboard:pause" : "clipboard:resume")
  }

  @objc private func runCommand(_ sender: NSMenuItem) {
    guard let command = sender.representedObject as? String else { return }
    send(command)
    if command == "quit" { NSApplication.shared.terminate(nil) }
  }

  private func send(_ command: String) {
    let encoded = command.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? command
    guard let url = URL(string: "lingoisland://command?action=\(encoded)") else { return }
    NSWorkspace.shared.open(url)
  }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
application.run()
