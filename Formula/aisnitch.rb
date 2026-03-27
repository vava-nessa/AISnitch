class Aisnitch < Formula
  desc "Universal live bridge for AI coding tool activity"
  homepage "https://github.com/vava-nessa/AISnitch#readme"
  url "https://registry.npmjs.org/aisnitch/-/aisnitch-0.1.0.tgz"
  sha256 "6693df9d2073ed9e9da5df9cc8dcfc9ce33c5cbc7a97ebb86edf3451f2c5db08"
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec/"bin/aisnitch"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/aisnitch --version")
  end
end
