class Aisnitch < Formula
  desc "Universal live bridge for AI coding tool activity"
  homepage "https://github.com/vava-nessa/AISnitch#readme"
  url "https://registry.npmjs.org/aisnitch/-/aisnitch-0.2.0.tgz"
  sha256 "cf545312f1ca618fe76276e42cda031c56655e3bed162e63955d5985d6288b37"
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
