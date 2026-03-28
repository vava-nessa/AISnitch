class Aisnitch < Formula
  desc "Universal live bridge for AI coding tool activity"
  homepage "https://github.com/vava-nessa/AISnitch#readme"
  url "https://registry.npmjs.org/aisnitch/-/aisnitch-0.2.2.tgz"
  sha256 "2e056dfa09afa7a2ac9c62ade2481246bf01edccf48b880fde5a51d7f48db801"
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
