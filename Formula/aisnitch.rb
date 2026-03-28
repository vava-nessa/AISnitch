class Aisnitch < Formula
  desc "Universal live bridge for AI coding tool activity"
  homepage "https://github.com/vava-nessa/AISnitch#readme"
  url "https://registry.npmjs.org/aisnitch/-/aisnitch-0.2.1.tgz"
  sha256 "2a6c456971c53cd804cc9840284c6ab2a696824c04f9c34775e46218622cc15c"
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
