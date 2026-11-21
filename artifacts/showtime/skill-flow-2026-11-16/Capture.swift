import UIKit
import WebKit

@main
final class Capture: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let view = UIViewController()
        view.view.backgroundColor = .white
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        if let script = try? String(contentsOf: Bundle.main.url(forResource: "scene", withExtension: "js")!, encoding: .utf8) {
            config.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let web = WKWebView(frame: .zero, configuration: config)
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.translatesAutoresizingMaskIntoConstraints = false
        view.view.addSubview(web)
        let safe = view.view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: safe.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.view.bottomAnchor),
            web.leftAnchor.constraint(equalTo: safe.leftAnchor),
            web.rightAnchor.constraint(equalTo: safe.rightAnchor)
        ])
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = view
        window?.makeKeyAndVisible()
        web.load(URLRequest(url: URL(string: "http://127.0.0.1:5189/")!))
        return true
    }
}
